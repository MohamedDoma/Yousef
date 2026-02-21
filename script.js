import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

// ==========================================
// 1. تعريف الدوال العامة
// ==========================================

window.activateAdminMode = () => {
    console.log("Admin Mode Activated");
    document.body.classList.add('is-admin');
};

window.openModal = (id) => {
    const modal = document.getElementById(id);
    if(modal) modal.classList.add('active');
};
window.closeModal = (id) => {
    const modal = document.getElementById(id);
    if(modal) modal.classList.remove('active');
};

// ==========================================
// دوال عرض ملفات PDF (Google Drive Preview)
// ==========================================

// دالة تحويل رابط درايف إلى رابط معاينة
window.getDrivePreviewLink = (url) => {
    if (!url) return "";
    const idMatch = url.match(/\/d\/(.+?)\//);
    if (url.includes('drive.google.com') && idMatch && idMatch[1]) {
        return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
    }
    return url; 
};

// دالة فتح نافذة العرض
window.viewPdf = (url) => {
    const previewUrl = getDrivePreviewLink(url);
    const frame = document.getElementById('pdfFrame');
    if(frame) {
        frame.src = previewUrl;
        openModal('pdfViewerModal');
    }
};

// ==========================================
// 2. الاتصال بـ Firebase
// ==========================================

const firebaseConfig = JSON.parse(window.__firebase_config);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = (typeof window.__app_id !== 'undefined') ? window.__app_id : 'al-wafa-sports-v1';

let allRegistrations = [];
let registrationOpen = true;

// دالة حذف التسجيل
window.deleteReg = async (id) => {
    if (!auth.currentUser) return alert("يجب أن تكون متصلاً للحذف");
    if(confirm("حذف هذا المسجل نهائياً؟")) {
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'registrations', id));
            showStatus("تم الحذف", "#ef4444");
        } catch (error) {
            console.error("Error deleting:", error);
            showStatus("حدث خطأ في الحذف", "#ef4444");
        }
    }
};

const showStatus = (msg, color) => {
    const el = document.getElementById('statusMsg');
    if(el) {
        el.innerText = msg; el.style.display = 'block'; el.style.background = color;
        setTimeout(() => el.style.display = 'none', 3000);
    }
};

// دالة معالجة الرابط وتحويله إلى كود تضمين (Embed)
const processStreamInput = (url) => {
    if (!url) return "";
    
    // إذا كان المدخل كود iframe جاهز، استخدمه كما هو
    if (url.includes('<iframe')) return url;
    
    // فحص روابط يوتيوب واستخراج معرف الفيديو
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(ytRegex);
    
    if (match && match[1]) {
        return `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${match[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    
    // إذا كان رابطاً عادياً (مثل فيسبوك أو غيره)، ضعه داخل iframe
    return `<iframe width="100%" height="100%" src="${url}" frameborder="0" allowfullscreen></iframe>`;
};

// مستمعات واجهة المستخدم (UI Listeners)
const regGameSelect = document.getElementById('regGame');
const updateFormFields = () => {
    const teamNameWrapper = document.getElementById('teamNameWrapper');
    const teamPlayersContainer = document.getElementById('teamPlayersContainer');
    const playerInputsGrid = document.getElementById('playerInputs');
    
    if(!regGameSelect || !teamNameWrapper) return;

    const game = regGameSelect.value;
    const isTeamGame = ["كرة القدم", "الجطوني"].includes(game);
    if (isTeamGame) {
        teamNameWrapper.classList.remove('hidden');
        teamPlayersContainer.classList.add('active');
        let count = game === "الجطوني" ? 2 : 8;
        playerInputsGrid.innerHTML = "";
        for (let i = 1; i <= count; i++) {
            const input = document.createElement('input');
            input.type = "text"; input.placeholder = `لاعب ${i}`; input.className = "player-input text-right";
            playerInputsGrid.appendChild(input);
        }
    } else {
        teamNameWrapper.classList.add('hidden');
        teamPlayersContainer.classList.remove('active');
    }
};
if(regGameSelect) regGameSelect.addEventListener('change', updateFormFields);

// معالج الأخطاء
const handleFirestoreError = (err) => {
    console.warn("جاري انتظار البيانات... (تأكد من إنشاء المجلدات في Firebase)", err.code);
};

// ==========================================
// 3. منطق التطبيق (يعمل بعد تسجيل الدخول)
// ==========================================

// 3.5. الواجهة الرئيسية (عنوان + صورة)
    const heroRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'hero');
    onSnapshot(heroRef, (snap) => {
        const data = snap.data();
        
        // 1. تحديث النص (كما كان سابقاً)
        const defaultText = currentLang === 'en' ? "Al-Wafa Fields Call You" : "ملاعب الوفاء تناديكم";
        let textToShow = defaultText;
        if (data) {
             if (currentLang === 'en' && data.text_en) textToShow = data.text_en;
             else if (currentLang === 'ar' && data.text) textToShow = data.text;
        }
        const heroTitleEl = document.getElementById('heroTitle');
        if(heroTitleEl) heroTitleEl.innerText = textToShow;

        // 2. تحديث الصورة (مع معالجة روابط جوجل درايف لتظهر مباشرة)
        const defaultImg = "https://drive.google.com/thumbnail?id=12_e3EC9QX9YFPc7eXcVF_fsco7qhmRv-&sz=w1200";
        const heroImgEl = document.getElementById('heroBgImg');
        
        if(heroImgEl) {
            let finalImgUrl = data?.image || defaultImg;
            
            // تحويل رابط Google Drive العادي إلى رابط صورة مباشر (Direct Thumbnail)
            const idMatch = finalImgUrl.match(/\/d\/(.+?)\//) || finalImgUrl.match(/id=(.+?)(&|$)/);
            if (finalImgUrl.includes('drive.google.com') && idMatch) {
                const fileId = idMatch[1];
                finalImgUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
            }
            
            heroImgEl.src = finalImgUrl;
        }

    }, handleFirestoreError);
    
    document.getElementById('saveHeroBtn').onclick = () => {
        const newTextAr = document.getElementById('heroInput').value;
        const newTextEn = document.getElementById('heroInputEn').value;
        const newImg = document.getElementById('heroImgInput').value;

        // نجهز البيانات للتحديث (نحدث فقط الحقول التي تم تعبئتها)
        const updateData = {};
        if(newTextAr) updateData.text = newTextAr;
        if(newTextEn) updateData.text_en = newTextEn;
        if(newImg) updateData.image = newImg;

        if(Object.keys(updateData).length > 0) {
            setDoc(heroRef, updateData, { merge: true });
            closeModal('heroAdminModal');
            showStatus("تم تحديث الواجهة بنجاح", "#10b981");
        }
    };

// 3.6. أرقام التواصل (نظام القائمة الديناميكية)
    const contactsRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'contacts');
    window.currentContacts = []; // مخزن للأرقام الحالية

    // أ) الاستماع للتحديثات وعرض الأرقام في الفوتر
    onSnapshot(contactsRef, (snap) => {
        const data = snap.data();
        // استخدام قائمة موجودة أو وضع القائمة الافتراضية
        const list = data?.list || ["0911592379", "0912500363"];
        window.currentContacts = list; // تحديث المتغير العام

        const container = document.getElementById('contactsContainer');
        if(container) {
            container.innerHTML = ''; // مسح القديم
            list.forEach(num => {
                const a = document.createElement('a');
                a.href = `tel:${num}`;
                a.className = 'contact-pill'; // نفس تنسيق CSS القديم
                a.innerHTML = `<span class="text-yellow-400">📞</span> للتواصل والاستفسار: ${num}`;
                container.appendChild(a);
            });
        }
    }, handleFirestoreError);

    // ب) دوال إدارة النافذة (إضافة وحذف مؤقت قبل الحفظ)
    window.tempContacts = [];

    // دالة لفتح النافذة وتجهيز القائمة
    window.openContactsEditor = () => {
        window.tempContacts = [...window.currentContacts]; // نأخذ نسخة من الأرقام الحالية
        window.renderAdminContacts();
        openModal('contactsAdminModal');
    };

    // دالة رسم القائمة داخل نافذة الأدمن
    window.renderAdminContacts = () => {
        const listDiv = document.getElementById('adminContactsList');
        listDiv.innerHTML = '';
        window.tempContacts.forEach((num, index) => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center bg-white p-2 rounded border border-gray-200';
            div.innerHTML = `
                <span class="font-mono font-bold text-blue-900">${num}</span>
                <button onclick="removeContactFromList(${index})" class="text-red-500 font-bold text-xs bg-red-50 px-2 py-1 rounded hover:bg-red-100">حذف ❌</button>
            `;
            listDiv.appendChild(div);
        });
    };

    // دالة إضافة رقم للقائمة المؤقتة
    window.addContactToTempList = () => {
        const input = document.getElementById('newContactInput');
        const val = input.value.trim();
        if(val) {
            window.tempContacts.push(val); // إضافة للقائمة
            input.value = '';
            window.renderAdminContacts(); // إعادة رسم القائمة
        }
    };

    // دالة حذف رقم من القائمة المؤقتة
    window.removeContactFromList = (index) => {
        window.tempContacts.splice(index, 1); // حذف العنصر
        window.renderAdminContacts(); // إعادة رسم القائمة
    };

    // ج) زر الحفظ النهائي (إرسال للقاعدة)
    document.getElementById('saveContactsBtn').onclick = () => {
        if(window.tempContacts.length > 0) {
            setDoc(contactsRef, { list: window.tempContacts }, { merge: true });
            closeModal('contactsAdminModal');
            showStatus("تم تحديث قائمة الأرقام", "#10b981");
        } else {
            alert("يجب أن تبقي رقماً واحداً على الأقل!");
        }
    };

    // ==========================================
    // 3.7. نظام الحماية (الأدمن)
    // ==========================================
    let currentAdminPass = "123456"; // القيمة الافتراضية
    const securityRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'security');

    // مراقبة كلمة المرور من قاعدة البيانات
    onSnapshot(securityRef, (snap) => {
        if (snap.exists()) {
            currentAdminPass = snap.data().password;
        } else {
            // إذا لم يكن هناك كلمة مرور محفوظة، ننشئ الافتراضية
            setDoc(securityRef, { password: "123456" });
        }
    });

    // معالجة تسجيل الدخول
    document.getElementById('loginForm').onsubmit = (e) => {
        e.preventDefault();
        const input = document.getElementById('loginPassInput').value;
        
        if (input === currentAdminPass) {
            window.activateAdminMode(); // تفعيل الأدمن
            closeModal('loginModal');
            document.getElementById('loginPassInput').value = ""; // تفريغ الحقل
            showStatus("مرحباً بك أيها المشرف", "#1e3a8a");
        } else {
            alert("كلمة المرور غير صحيحة ❌");
            document.getElementById('loginPassInput').value = "";
        }
    };

    // معالجة تغيير كلمة المرور
    document.getElementById('changePassForm').onsubmit = (e) => {
        e.preventDefault();
        const newPass = document.getElementById('newPassInput').value;
        
        if (newPass.length < 4) {
            alert("كلمة المرور ضعيفة جداً، اختر 4 أرقام/حروف على الأقل");
            return;
        }

        if(confirm("هل أنت متأكد من تغيير كلمة المرور؟")) {
            setDoc(securityRef, { password: newPass }, { merge: true });
            closeModal('changePassModal');
            showStatus("تم تغيير كلمة المرور بنجاح", "#10b981");
        }
    };

const setupApp = (user) => {
    if (!user) return;
    console.log("Connected as:", user.uid);

    // 1. عداد الزيارات
    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'stats', 'main');
    setDoc(statsRef, { views: increment(1) }, { merge: true }).catch(e => console.log("Creating stats..."));
    
    onSnapshot(statsRef, (s) => {
        if(s.exists()) document.getElementById('visitorCount').innerText = s.data()?.views || 0;
    }, handleFirestoreError);

    // 2. حالة التسجيل (مفتوح/مغلق)
    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'registration');
    onSnapshot(configRef, (snap) => {
        const data = snap.data();
        registrationOpen = data?.isOpen ?? true;
        const btn = document.getElementById('toggleRegBtn');
        const form = document.getElementById('registrationForm');
        const msg = document.getElementById('registrationClosedMsg');
        
        if(registrationOpen) {
            btn.innerText = "🟢 التسجيل: مفتوح"; btn.className = "bg-green-600 text-white p-2 rounded-lg text-[10px] font-bold";
            form.classList.remove('hidden'); msg.classList.add('hidden');
        } else {
            btn.innerText = "🔴 التسجيل: مغلق"; btn.className = "bg-red-600 text-white p-2 rounded-lg text-[10px] font-bold";
            form.classList.add('hidden'); msg.classList.remove('hidden');
        }
    }, handleFirestoreError);

    document.getElementById('toggleRegBtn').onclick = () => {
        setDoc(configRef, { isOpen: !registrationOpen }, { merge: true });
    };

// 3. شريط الأخبار (ذكي: يعرض حسب لغة الموقع)
    const marqueeRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'marquee');
    
    onSnapshot(marqueeRef, (snap) => {
        const data = snap.data();
        
        let textToShow = "";

        if (currentLang === 'en') {
            // إذا كانت اللغة إنجليزية، اعرض النص الإنجليزي
            // (إذا لم يكن موجوداً، اعرض العربي كاحتياط)
            textToShow = data?.text_en || data?.text || "Welcome to Al-Wafa Sports Committee";
        } else {
            // إذا كانت اللغة عربية، اعرض النص العربي
            textToShow = data?.text || "مرحباً بكم في اللجنة الرياضية";
        }

        document.getElementById('marqueeText').innerText = textToShow;
        
    }, handleFirestoreError);
    
    // كود الحفظ (يبقى كما هو ليحفظ اللغتين)
    document.getElementById('saveMarqueeBtn').onclick = () => {
        setDoc(marqueeRef, { 
            text: document.getElementById('marqueeInput').value,
            text_en: document.getElementById('marqueeInputEn').value 
        }, { merge: true });
        closeModal('marqueeAdminModal');
        showStatus("تم تحديث الشريط", "#10b981");
    };

    // 4. البث المباشر
    // 4. البث المباشر (Multi-Stream)
    // 4. البث المباشر (نظام النوافذ المنفصلة تحت بعض)
    const streamRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'stream');
    
    onSnapshot(streamRef, (snap) => {
        const d = snap.data();
        const container = document.getElementById('multiStreamContainer');
        const liveIndicator = document.getElementById('liveIndicator'); // تأكد من وجوده في مكان آخر أو احذفه
        
        // مسح الحاوية تماماً قبل إعادة البناء
        container.innerHTML = "";

        if(d?.active && d.streams && d.streams.length > 0) {
            window.tempStreams = d.streams; // تحديث القائمة للأدمن

            d.streams.forEach((s, index) => {
                const title = (currentLang === 'en' && s.title_en) ? s.title_en : s.title;
                
                // بناء Section كامل لكل فيديو
                const section = document.createElement('section');
                section.className = "bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-gray-800 mb-8";
                section.innerHTML = `
                    <div class="p-3 bg-red-600 text-white font-bold flex items-center justify-between text-xs">
                        <div class="flex items-center">
                            <span class="w-2 h-2 bg-white rounded-full animate-ping ml-2"></span>
                            <span>${title || (currentLang === 'en' ? 'Live Stream' : 'بث مباشر')}</span>
                        </div>
                        <button onclick="toggleStreamFullScreenById('stream-frame-${index}')" class="hover:bg-red-700 p-1 rounded transition">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        </button>
                    </div>
                    <div id="stream-frame-${index}" class="aspect-video bg-black w-full">
                        ${s.embedCode}
                    </div>
                `;
                container.appendChild(section);
            });
        } else {
            // حالة عدم وجود بث
            container.innerHTML = `
                <section class="bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-gray-800">
                    <div class="p-3 bg-gray-700 text-white font-bold text-xs text-center">لا يوجد بث مباشر حالياً</div>
                    <div class="aspect-video bg-black flex items-center justify-center text-white/40 text-sm">Offline</div>
                </section>
            `;
            window.tempStreams = [];
        }
    }, handleFirestoreError);

    // ب) وظائف إدارة الشاشات في لوحة التحكم
    // مغيرات الحالة لنظام البث
window.tempStreams = []; 
window.editStreamIndex = -1; // -1 تعني وضع "إضافة" جديد

// دالة لفتح نافذة البث وتحديث القائمة فوراً
window.openStreamEditor = () => {
    window.editStreamIndex = -1; // العودة لوضع الإضافة الافتراضي
    // تصفير الخانات عند الفتح
    document.getElementById('newStreamUrl').value = '';
    document.getElementById('newStreamTitleAr').value = '';
    document.getElementById('newStreamTitleEn').value = '';
    window.renderAdminStreams(); // تحديث القائمة لتظهر الشاشات فوراً
    openModal('streamAdminModal');
};

// دالة رسم القائمة في لوحة التحكم مع زر التعديل
window.renderAdminStreams = () => {
    const listDiv = document.getElementById('adminStreamsList');
    if(!listDiv) return;
    listDiv.innerHTML = '';
    
    window.tempStreams.forEach((s, index) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200 mb-2 transition hover:border-red-300';
        div.innerHTML = `
            <div class="flex flex-col flex-1 overflow-hidden ml-2 text-right">
                <span class="font-bold text-blue-900 text-[11px] truncate">${s.title || 'بدون عنوان'}</span>
                <span class="text-gray-400 text-[9px] font-mono truncate text-left" dir="ltr">${s.url}</span>
            </div>
            <div class="flex gap-1">
                <button onclick="editStreamFromList(${index})" class="text-blue-600 bg-blue-50 px-2 py-1 rounded text-[10px] font-bold">تعديل</button>
                <button onclick="removeStreamFromList(${index})" class="text-red-500 bg-red-50 px-2 py-1 rounded text-[10px] font-bold">حذف</button>
            </div>
        `;
        listDiv.appendChild(div);
    });
};

// دالة الإضافة أو تحديث العنصر المختار
window.addStreamToTempList = () => {
    const urlInput = document.getElementById('newStreamUrl');
    const titleAr = document.getElementById('newStreamTitleAr');
    const titleEn = document.getElementById('newStreamTitleEn');
    
    if(!urlInput.value.trim()) return alert("يرجى وضع الرابط أولاً");

    const streamData = {
        url: urlInput.value.trim(),
        title: titleAr.value.trim(),
        title_en: titleEn.value.trim(),
        embedCode: processStreamInput(urlInput.value.trim()) 
    };

    if (window.editStreamIndex === -1) {
        window.tempStreams.push(streamData); // إضافة فيديو جديد للقائمة
    } else {
        window.tempStreams[window.editStreamIndex] = streamData; // تعديل الفيديو الحالي
        window.editStreamIndex = -1; // تصفير مؤشر التعديل
    }

    urlInput.value = ''; titleAr.value = ''; titleEn.value = '';
    window.renderAdminStreams();
};

// دالة التعديل: تضع بيانات الفيديو المختار في الخانات لتتمكن من تغييرها
window.editStreamFromList = (index) => {
    const s = window.tempStreams[index];
    window.editStreamIndex = index;
    
    document.getElementById('newStreamUrl').value = s.url;
    document.getElementById('newStreamTitleAr').value = s.title;
    document.getElementById('newStreamTitleEn').value = s.title_en || '';
    
    document.getElementById('newStreamTitleAr').focus(); // توجيه المؤشر للعنوان تلقائياً
};

window.removeStreamFromList = (index) => {
    window.tempStreams.splice(index, 1);
    window.renderAdminStreams();
};

    // ج) الحفظ والإيقاف
    document.getElementById('saveStreamsBtn').onclick = () => {
    if(window.tempStreams.length > 0) {
        // إرسال المصفوفة كاملة لـ Firebase
        setDoc(streamRef, { 
            active: true, 
            streams: window.tempStreams 
        }, { merge: true });
        
        closeModal('streamAdminModal');
        showStatus("تم تحديث وتفعيل البث", "#10b981");
    } else {
        alert("يرجى إضافة شاشة واحدة على الأقل قبل الحفظ");
    }
};

    document.getElementById('stopStreamBtn').onclick = () => {
        if(confirm("هل تريد إيقاف جميع شاشات البث؟")) {
            setDoc(streamRef, { active: false, streams: [] }, { merge: true });
            closeModal('streamAdminModal');
            showStatus("تم إيقاف البث", "#4b5563");
        }
    };

    // 5. جلب البيانات (Listeners)
    const setupCollectionListener = (colName, containerId, renderFunc) => {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', colName), orderBy('timestamp', 'desc'));
        onSnapshot(q, (snap) => {
            const container = document.getElementById(containerId);
            container.innerHTML = "";
            snap.forEach(d => container.appendChild(renderFunc(d.id, d.data())));
        }, handleFirestoreError);
    };

    // ==========================================
    // ✅ الكود الجديد: الأخبار (عرض + تعديل + حذف + صورة)
    // ==========================================

    window.newsCache = {};

    // 1. دالة التعديل (تعبئة البيانات + الصورة)
    window.editNews = (id) => {
        const data = window.newsCache[id];
        if(!data) return;
        document.getElementById('editNewsId').value = id;
        document.getElementById('newsImgInput').value = data.image || ""; // تعبئة رابط الصورة
        document.getElementById('newsTitle').value = data.title || "";
        document.getElementById('newsContent').value = data.content || "";
        document.getElementById('newsTitleEn').value = data.title_en || "";
        document.getElementById('newsContentEn').value = data.content_en || "";
        openModal('newsAdminModal');
    };

    // 2. دالة التصفير
    window.resetNewsForm = () => {
        document.getElementById('editNewsId').value = ""; 
        document.getElementById('newsAdminForm').reset();
    };
// دالة مساعدة لزر اقرأ المزيد
    window.toggleNewsText = (btn, textId) => {
        const textEl = document.getElementById(textId);
        // التبديل بين الحالتين
        if (textEl.classList.contains('news-truncated')) {
            textEl.classList.remove('news-truncated'); // إظهار النص كامل
            btn.innerText = (currentLang === 'en') ? "Read Less" : "عرض أقل";
        } else {
            textEl.classList.add('news-truncated'); // قص النص
            btn.innerText = (currentLang === 'en') ? "Read More" : "اقرأ المزيد";
        }
    };

    // 3. العرض (مع الصورة + اقرأ المزيد + زر التعديل)
    setupCollectionListener('news', 'newsContainer', (id, n) => {
        window.newsCache[id] = n; 

        const displayTitle = (currentLang === 'en' && n.title_en) ? n.title_en : n.title;
        const displayContent = (currentLang === 'en' && n.content_en) ? n.content_en : n.content;
        const alignClass = (currentLang === 'en' && n.title_en) ? 'text-left' : 'text-right';

        // تجهيز الصورة
        let imageHTML = '';
        if (n.image && n.image.trim() !== "") {
            imageHTML = `<img src="${n.image}" class="w-full h-64 object-cover rounded-xl mt-4 border border-gray-100 shadow-sm" alt="News Image">`;
        }

        // --- منطق اقرأ المزيد ---
        // سنفحص هل النص طويل؟ (أكثر من 200 حرف مثلاً)
        const isLongText = displayContent.length > 200;
        const textId = `news-txt-${id}`;
        
        // إذا النص طويل نضيف كلاس القص، وإذا قصير لا نضيفه
        const truncateClass = isLongText ? 'news-truncated' : '';
        
        // زر اقرأ المزيد يظهر فقط لو النص طويل
        const readMoreBtn = isLongText 
            ? `<button onclick="toggleNewsText(this, '${textId}')" class="text-blue-600 text-xs font-bold mt-2 hover:underline">${currentLang === 'en' ? 'Read More' : 'اقرأ المزيد'}</button>` 
            : '';
        // ------------------------

        const el = document.createElement('div');
        el.className = `bg-white p-6 rounded-3xl shadow-sm border-r-4 border-blue-900 relative ${alignClass}`;
        el.innerHTML = `
            <div class="admin-only absolute left-4 top-4 flex gap-2 z-10">
                <button class="text-blue-600 text-xs font-bold bg-blue-50 px-2 py-1 rounded hover:bg-blue-100" onclick="editNews('${id}')">Edit</button>
                <button class="text-red-400 text-xs font-bold bg-red-50 px-2 py-1 rounded hover:bg-red-100" onclick="deleteDocById('news', '${id}')">Delete</button>
            </div>
            
            <h4 class="text-xl font-black text-blue-900 mb-2 mt-4">${displayTitle}</h4>
            
            <p id="${textId}" class="text-gray-600 text-sm font-bold formatted-text ${truncateClass}">${displayContent}</p>
            ${readMoreBtn} ${imageHTML}
        `;
        return el;
    });

    // 4. الحفظ (حفظ حقل الصورة)
    const newsForm = document.getElementById('newsAdminForm');
    if(newsForm) {
        newsForm.onsubmit = async (e) => {
            e.preventDefault();
            if (!auth.currentUser) return showStatus("غير متصل", "#ef4444");

            const id = document.getElementById('editNewsId').value;
            const newsData = {
                image: document.getElementById('newsImgInput').value, // حفظ الرابط
                title: document.getElementById('newsTitle').value,
                content: document.getElementById('newsContent').value,
                title_en: document.getElementById('newsTitleEn').value,
                content_en: document.getElementById('newsContentEn').value
            };

            try {
                if (id) {
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', id), newsData, { merge: true });
                    showStatus("تم التعديل بنجاح", "#3b82f6");
                } else {
                    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'news'), {
                        ...newsData,
                        timestamp: serverTimestamp()
                    });
                    showStatus("تم النشر بنجاح", "#10b981");
                }
                closeModal('newsAdminModal');
                newsForm.reset();
            } catch (err) {
                console.error(err);
                showStatus("حدث خطأ", "#ef4444");
            }
        };
    }
// الإعلانات (تصميم مودرن + عرض داخل الموقع)
    setupCollectionListener('ads', 'adsContainer', (id, a) => {
        const displayTitle = (currentLang === 'en' && a.title_en) ? a.title_en : a.title;
        const textAlign = (currentLang === 'en') ? 'text-left' : 'text-right';

        const el = document.createElement('div');
        el.className = "relative group mb-3"; 
        
        el.innerHTML = `
            <div onclick="viewPdf('${a.link}')" class="download-card card-type-ads cursor-pointer hover:bg-gray-50">
                <div class="flex-1 px-3 ${textAlign}">
                    <h5 class="font-bold text-gray-800 text-sm leading-tight">${displayTitle}</h5>
                    <p class="text-[10px] text-gray-400 mt-1 font-mono">Click to View / اضغط للعرض</p>
                </div>
                
                <div class="dl-icon-wrapper shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                </div>
            </div>

            <button class="admin-only absolute -top-2 -left-2 bg-red-500 text-white w-6 h-6 rounded-full shadow-md text-xs font-bold opacity-0 group-hover:opacity-100 transition flex items-center justify-center z-10" 
            onclick="deleteDocById('ads', '${id}')">X</button>
        `;
        return el;
    });

    // اللوائح (تصميم مودرن + عرض داخل الموقع)
    setupCollectionListener('rules', 'rulesContainer', (id, r) => {
        const displayTitle = (currentLang === 'en' && r.title_en) ? r.title_en : r.title;
        const textAlign = (currentLang === 'en') ? 'text-left' : 'text-right';

        const el = document.createElement('div');
        el.className = "relative group mb-3";
        
        el.innerHTML = `
            <div onclick="viewPdf('${r.link}')" class="download-card card-type-rules cursor-pointer hover:bg-gray-50">
                <div class="flex-1 px-3 ${textAlign}">
                    <h5 class="font-bold text-gray-800 text-sm leading-tight">${displayTitle}</h5>
                    <p class="text-[10px] text-gray-400 mt-1 font-mono">View Rule / عرض اللائحة</p>
                </div>

                <div class="dl-icon-wrapper shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
            </div>

            <button class="admin-only absolute -top-2 -left-2 bg-red-500 text-white w-6 h-6 rounded-full shadow-md text-xs font-bold opacity-0 group-hover:opacity-100 transition flex items-center justify-center z-10" 
            onclick="deleteDocById('rules', '${id}')">X</button>
        `;
        return el;
    });

// المسجلين (مع تحديث الفلاتر تلقائياً)
    const regsQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'registrations'), orderBy('timestamp', 'desc'));
    onSnapshot(regsQuery, (snap) => {
        allRegistrations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // 1. تحديث الجدول
        const body = document.getElementById('regsTableBody');
        body.innerHTML = allRegistrations.map((r, i) => `
            <tr>
                <td class="p-3 text-gray-400 font-bold">${i+1}</td>
                <td class="p-3 font-bold">
                    ${r.teamName || r.name}
                    ${r.teamMembers && r.teamMembers.length > 0 ? `<div class="text-[9px] text-gray-500 mt-1">(${r.teamMembers.length} لاعبين)</div>` : ''}
                </td>
                <td class="p-3 text-center">${r.game}</td>
                <td class="p-3 text-center">${r.phone}</td>
                <td class="admin-only p-3 text-center"><button class="text-red-500 font-bold" onclick="deleteReg('${r.id}')">حذف</button></td>
            </tr>`).join('');

        // 2. تحديث فلاتر التصدير (Checkboxes)
        updateExportFilters();
        
    }, handleFirestoreError);

    // دالة إنشاء مربعات الاختيار (Filters)
    const updateExportFilters = () => {
        const container = document.getElementById('exportFilters');
        if(!container) return;

        // استخراج أسماء الألعاب الموجودة فقط
        const uniqueGames = [...new Set(allRegistrations.map(r => r.game))];
        
        // الحفاظ على الاختيارات السابقة إذا وجدت
        const currentChecked = Array.from(document.querySelectorAll('.sport-filter:checked')).map(cb => cb.value);

        container.innerHTML = uniqueGames.map(game => {
            const isChecked = currentChecked.length === 0 ? true : currentChecked.includes(game); // افتراضياً الكل محدد أول مرة
            return `
                <label class="flex items-center gap-1 bg-white px-3 py-1 rounded-lg border cursor-pointer hover:border-blue-500 transition">
                    <input type="checkbox" value="${game}" class="sport-filter" ${isChecked ? 'checked' : ''}>
                    <span class="text-xs font-bold text-gray-700">${game}</span>
                </label>
            `;
        }).join('');
        
        if(uniqueGames.length === 0) container.innerHTML = '<span class="text-xs text-gray-400">لا توجد تسجيلات بعد</span>';
    };

    window.deleteDocById = async (colName, id) => {
        if(confirm("تأكيد الحذف؟")) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', colName, id));
        }
    }
};

// ==========================================
// Form Submission Handlers (المحرك الرئيسي)
// ==========================================

const handleFormSubmit = async (formId, colName, dataBuilder) => {
    const form = document.getElementById(formId);
    if(!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        if (!auth.currentUser) return showStatus("غير متصل - تأكد من الانترنت", "#ef4444");
        
        try {
            const data = dataBuilder(); 
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', colName), {
                ...data,
                timestamp: serverTimestamp()
            });
            e.target.reset();
            if(formId.includes('Modal')) closeModal(formId.replace('Form', 'Modal'));
            showStatus("تمت العملية بنجاح", "#10b981");
            if(formId === 'registrationForm') updateFormFields();
        } catch (err) {
            if (err.message !== "Closed" && err.message !== "Duplicate") {
                console.error(err);
                showStatus("حدث خطأ في الحفظ", "#ef4444");
            }
        }
    };
};

// تعديل: حفظ الخبر باللغتين
// handleFormSubmit('newsAdminForm', 'news', () => ({
//     title: document.getElementById('newsTitle').value,
//     content: document.getElementById('newsContent').value,
//     title_en: document.getElementById('newsTitleEn').value,     // حقل جديد
//     content_en: document.getElementById('newsContentEn').value  // حقل جديد
// }));

// تحديث حفظ الإعلانات
    handleFormSubmit('adsAdminForm', 'ads', () => ({
        title: document.getElementById('adTitle').value,
        title_en: document.getElementById('adTitleEn').value,
        link: document.getElementById('adLink').value
    }));

    // تحديث حفظ اللوائح
    handleFormSubmit('rulesAdminForm', 'rules', () => ({
        title: document.getElementById('ruleTitle').value,
        title_en: document.getElementById('ruleTitleEn').value,
        link: document.getElementById('ruleLink').value
    }));

// ===============================================
// 5. منطق التسجيل (حفظ الأعضاء + منع التكرار الشامل)
// ===============================================
handleFormSubmit('registrationForm', 'registrations', () => {
    if(!registrationOpen) { alert("التسجيل مغلق حالياً"); throw new Error("Closed"); }

    const inputName = document.getElementById('regName').value.trim();
    const inputGame = document.getElementById('regGame').value;
    
    // جمع أسماء أعضاء الفريق (إن وجدت)
    const teamMemberInputs = document.querySelectorAll('.player-input');
    const teamMembers = [];
    teamMemberInputs.forEach(input => {
        if(input.value.trim()) teamMembers.push(input.value.trim());
    });

    // قائمة بكل الأسماء الجديدة التي نريد فحصها (الكابتن + الأعضاء)
    const allNewNamesToCheck = [inputName, ...teamMembers];

    // التحقق من التكرار في قاعدة البيانات
    if (allRegistrations && allRegistrations.length > 0) {
        // نفلتر التسجيلات الخاصة بنفس اللعبة فقط
        const sameGameRegs = allRegistrations.filter(r => r.game === inputGame);

        // نستخرج جميع الأسماء المسجلة في هذه اللعبة (رؤساء فرق + أعضاء)
        let allExistingNamesInGame = [];
        sameGameRegs.forEach(r => {
            if (r.name) allExistingNamesInGame.push(r.name.trim());
            if (r.teamMembers && Array.isArray(r.teamMembers)) {
                r.teamMembers.forEach(m => allExistingNamesInGame.push(m.trim()));
            }
        });

        // التحقق: هل أي اسم جديد موجود في القائمة القديمة؟
        const duplicateName = allNewNamesToCheck.find(newName => allExistingNamesInGame.includes(newName));

        if (duplicateName) {
            alert(`عذراً، الاسم "${duplicateName}" مسجل مسبقاً في لعبة ${inputGame} (سواء كفريق أو لاعب)!`);
            throw new Error("Duplicate");
        }
        
        // التحقق الداخلي: هل كرر المستخدم نفس الاسم مرتين في نفس النموذج؟
        const uniqueNames = new Set(allNewNamesToCheck);
        if (uniqueNames.size !== allNewNamesToCheck.length) {
            alert("عذراً، يوجد تكرار في الأسماء داخل القائمة التي تحاول إرسالها!");
            throw new Error("Duplicate");
        }
    }

    return {
        name: inputName,
        game: inputGame,
        workplace: document.getElementById('regWorkplace').value,
        phone: document.getElementById('regPhone').value,
        teamName: document.getElementById('teamName').value || "",
        teamMembers: teamMembers // حفظ قائمة اللاعبين في قاعدة البيانات
    };
});

// ==========================================
// 6. تصدير الوورد (النسخة الاحترافية مع الفلترة والصورة المحلية)
// ==========================================
document.getElementById('exportWordBtn').onclick = async () => {
    // 1. معرفة الرياضات المحددة من الفلتر
    const checkboxes = document.querySelectorAll('.sport-filter:checked');
    const selectedGames = Array.from(checkboxes).map(cb => cb.value);

    if (selectedGames.length === 0) {
        alert("الرجاء تحديد رياضة واحدة على الأقل للتصدير");
        return;
    }

    const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, AlignmentType, TextRun, ImageRun, PageBreak } = docx;

    // 2. تحميل الصورة المحلية
    let imageBlob = null;
    try {
        // ملاحظة: يجب أن تكون الصورة wafalogo.jpg بجانب ملف index.html
        const response = await fetch('wafalogo.jpg'); 
        if(response.ok) {
            imageBlob = await response.blob();
        } else {
            console.warn("Image not found locally: wafalogo.jpg");
        }
    } catch (e) {
        console.warn("Error loading local image", e);
    }

    // 3. تصفية البيانات حسب الاختيار
    const filteredData = allRegistrations.filter(r => selectedGames.includes(r.game));

    // 4. تجميع البيانات (Group by Game)
    const groupedData = {};
    filteredData.forEach(reg => {
        if (!groupedData[reg.game]) groupedData[reg.game] = [];
        groupedData[reg.game].push(reg);
    });

    const children = [];

    // الترويسة (Header) - تظهر مرة واحدة في البداية
    if (imageBlob) {
        children.push(new Paragraph({
            children: [new ImageRun({ data: imageBlob, transformation: { width: 100, height: 100 } })],
            alignment: AlignmentType.CENTER
        }));
    }
    
    children.push(new Paragraph({
        children: [new TextRun({ text: "اللجنة الرياضية لحقل الوفاء", bold: true, size: 32, color: "1E3A8A" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
    }));

    children.push(new Paragraph({
        children: [new TextRun({ text: "كشف المسجلين الرسمي", bold: true, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 }
    }));

    // بناء الصفحات لكل رياضة
    const sports = Object.keys(groupedData);
    
    sports.forEach((sport, index) => {
        const sportRegs = groupedData[sport];
        const isTeamSport = ["كرة القدم", "الجطوني"].includes(sport);

        if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
        else children.push(new Paragraph({ children: [new TextRun({ text: "", size: 0 })] })); // فاصل للصفحة الأولى

        // عنوان الرياضة
        children.push(new Paragraph({
            children: [new TextRun({ text: `الرياضة: ${sport}`, bold: true, size: 28, color: "Eab308" })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 400 }
        }));

        // رؤوس الجدول (مختلفة حسب نوع الرياضة)
        let headers = isTeamSport 
            ? ["ت", "اسم الفريق / الكابتن", "أعضاء الفريق", "رقم الهاتف"]
            : ["ت", "اسم اللاعب", "مكان العمل", "رقم الهاتف"];

        const headerRow = new TableRow({
            children: headers.reverse().map(text => 
                new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: text, bold: true, color: "FFFFFF" })], alignment: AlignmentType.CENTER })],
                    shading: { fill: "1E3A8A" },
                    verticalAlign: "center",
                })
            )
        });

        // بيانات الجدول
        const dataRows = sportRegs.map((reg, i) => {
            let cells = [];
            if (isTeamSport) {
                // تنسيق الألعاب الجماعية
                const members = (reg.teamMembers && reg.teamMembers.length > 0) ? reg.teamMembers.join("\n- ") : "لا يوجد";
                cells = [
                    new Paragraph({ text: reg.phone || "-", alignment: AlignmentType.CENTER }),
                    new Paragraph({ text: members, alignment: AlignmentType.RIGHT }),
                    new Paragraph({ text: reg.teamName || reg.name, bold: true, alignment: AlignmentType.CENTER }),
                    new Paragraph({ text: (i + 1).toString(), alignment: AlignmentType.CENTER }),
                ];
            } else {
                // تنسيق الألعاب الفردية
                cells = [
                    new Paragraph({ text: reg.phone || "-", alignment: AlignmentType.CENTER }),
                    new Paragraph({ text: reg.workplace || "-", alignment: AlignmentType.CENTER }),
                    new Paragraph({ text: reg.name, bold: true, alignment: AlignmentType.CENTER }),
                    new Paragraph({ text: (i + 1).toString(), alignment: AlignmentType.CENTER }),
                ];
            }
            return new TableRow({ children: cells.map(c => new TableCell({ children: [c], verticalAlign: "center" })) });
        });

        children.push(new Table({
            rows: [headerRow, ...dataRows],
            width: { size: 100, type: WidthType.PERCENTAGE },
        }));
        
        children.push(new Paragraph({
            children: [new TextRun({ text: `العدد الكلي: ${sportRegs.length}`, bold: true, size: 20 })],
            alignment: AlignmentType.LEFT,
            spacing: { before: 200 }
        }));
    });

    const docObj = new Document({ sections: [{ children: children }] });
    Packer.toBlob(docObj).then(blob => saveAs(blob, `كشف_${selectedGames.length}_رياضات.docx`));
};

// بدء التطبيق
const initAuthAndApp = async () => {
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (err) {
        console.error("Auth failed:", err);
    }
};

onAuthStateChanged(auth, (user) => {
    if (user) setupApp(user);
});

// ==========================================
// 7. نظام الترجمة (Translation System)
// ==========================================
let currentLang = localStorage.getItem('site_lang') || 'ar'; // قراءة اللغة المحفوظة أو الافتراضية

const translations = {
    ar: {
        site_title: "اللجنة الرياضية لحقل الوفاء",
        nav_home: "الرئيسية",
        nav_news: "الأخبار",
        nav_stream: "البث",
        nav_register: "سجل الآن",
        hero_default: "ملاعب الوفاء تناديكم",
        section_ads: "الإعلانات والتعميمات",
        section_rules: "القوانين واللوائح",
        section_news: "الأخبار والمقالات",
        reg_title: "التسجيل في الدوري",
        reg_closed: "التسجيل مغلق حالياً",
        reg_msg: "نأسف، تم اكتمال العدد أو إيقاف التسجيل مؤقتاً.",
        placeholder_name: "الاسم",
        placeholder_workplace: "مكان العمل",
        placeholder_phone: "رقم الموبايل",
        placeholder_team: "اسم الفريق",
        lbl_players: "قائمة أعضاء الفريق:",
        btn_confirm_reg: "تأكيد التسجيل",
        footer_rights: "Developed by Yousef Ben Halim",
        btn_lang: "English"
    },
    en: {
        site_title: "Al-Wafa Sports Committee",
        nav_home: "Home",
        nav_news: "News",
        nav_stream: "Live Stream",
        nav_register: "Register Now",
        hero_default: "Al-Wafa Fields Call You",
        section_ads: "Announcements",
        section_rules: "Rules & Regulations",
        section_news: "News & Articles",
        reg_title: "League Registration",
        reg_closed: "Registration Closed",
        reg_msg: "Sorry, registration is currently paused or full.",
        placeholder_name: "Full Name",
        placeholder_workplace: "Workplace / Department",
        placeholder_phone: "Mobile Number",
        placeholder_team: "Team Name",
        lbl_players: "Team Members List:",
        btn_confirm_reg: "Confirm Registration",
        footer_rights: "Developed by Yousef Ben Halim",
        btn_lang: "عربي"
    }
};

// ==========================================
// 8. وظيفة الشاشة الكاملة للبث
// ==========================================
window.toggleStreamFullScreenById = (elementId) => {
    const elem = document.getElementById(elementId);
    if (!document.fullscreenElement) {
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
};

// دالة التبديل (تُستدعى عند ضغط الزر)
window.toggleLanguage = () => {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('site_lang', currentLang);
    // عمل تحديث للصفحة ليتم تطبيق اللغة على الداتابيز
    location.reload(); 
};

// دالة تطبيق اللغة على العناصر
const applyLanguage = () => {
    // 1. تغيير اتجاه الصفحة ولغتها
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;

    // 2. ترجمة النصوص العادية (innerText)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            el.innerText = translations[currentLang][key];
        }
    });

    // 3. ترجمة النصوص التوضيحية (Placeholders)
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[currentLang][key]) {
            el.placeholder = translations[currentLang][key];
        }
    });

    // 4. تحديث نص زر اللغة نفسه
    const langBtn = document.getElementById('langBtn');
    if(langBtn) langBtn.innerText = translations[currentLang].btn_lang;

    // 5. معالجة العنوان الرئيسي (Hero Title) بذكاء
    // نغيره فقط إذا كان هو النص الافتراضي، أما إذا كتب الأدمن نصاً مخصصاً فلا نلمسه
    const heroTitle = document.getElementById('heroTitle');
    if (heroTitle) {
        const currentText = heroTitle.innerText;
        const defaultAr = translations['ar'].hero_default;
        const defaultEn = translations['en'].hero_default;
        
        // إذا كان النص الحالي هو الافتراضي (سواء عربي أو إنجليزي)، قم بالترجمة
        if (currentText === defaultAr || currentText === defaultEn) {
            heroTitle.innerText = translations[currentLang].hero_default;
        }
    }
};

// ==========================================
// 9. زر الصعود للأعلى (Scroll to Top)
// ==========================================
const scrollBtn = document.getElementById('scrollTopBtn');

// إظهار وإخفاء الزر عند التمرير
window.onscroll = () => {
    if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
        scrollBtn.classList.remove('hidden');
    } else {
        scrollBtn.classList.add('hidden');
    }
};

// وظيفة الصعود
window.scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// تشغيل اللغة فور فتح الموقع
applyLanguage();

initAuthAndApp();