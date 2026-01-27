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

// التعامل مع روابط البث
const processStreamInput = (input) => {
    if (!input) return "";
    if (input.includes('<iframe')) return input;
    let videoId = "";
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = input.match(ytRegex);
    if (match && match[1]) {
        videoId = match[1];
        return `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    return `<iframe width="100%" height="100%" src="${input}" frameborder="0" allowfullscreen></iframe>`;
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

        // 2. تحديث الصورة (الجديد)
        const defaultImg = "https://drive.google.com/thumbnail?id=12_e3EC9QX9YFPc7eXcVF_fsco7qhmRv-&sz=w1200";
        const heroImgEl = document.getElementById('heroBgImg');
        if(heroImgEl) {
            heroImgEl.src = data?.image || defaultImg;
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

    // 3.6. أرقام التواصل (Contacts)
    const contactsRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'contacts');
    
    onSnapshot(contactsRef, (snap) => {
        const data = snap.data();
        const p1 = data?.phone1 || "0911592379"; // الرقم الافتراضي الأول
        const p2 = data?.phone2 || "0912500363"; // الرقم الافتراضي الثاني

        // تحديث الرقم الأول
        const link1 = document.getElementById('contactLink1');
        if(link1) {
            link1.href = `tel:${p1}`;
            link1.innerHTML = `<span class="text-yellow-400">📞</span> للتواصل والاستفسار: ${p1}`;
        }

        // تحديث الرقم الثاني
        const link2 = document.getElementById('contactLink2');
        if(link2) {
            link2.href = `tel:${p2}`;
            link2.innerHTML = `<span class="text-yellow-400">📞</span> للتواصل والاستفسار: ${p2}`;
        }
    }, handleFirestoreError);

    document.getElementById('saveContactsBtn').onclick = () => {
        const p1 = document.getElementById('contactInput1').value;
        const p2 = document.getElementById('contactInput2').value;
        
        if(p1 && p2) {
            setDoc(contactsRef, { phone1: p1, phone2: p2 }, { merge: true });
            closeModal('contactsAdminModal');
            showStatus("تم تحديث الأرقام", "#10b981");
        } else {
            alert("يرجى إدخال الرقمين");
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

    // 3. شريط الأخبار (محدث للغتين)
    const marqueeRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'marquee');
    onSnapshot(marqueeRef, (snap) => {
        const data = snap.data();
        const text = (currentLang === 'en' && data?.text_en) ? data.text_en : (data?.text || "مرحباً بكم في اللجنة الرياضية");
        document.getElementById('marqueeText').innerText = text;
    }, handleFirestoreError);
    
    document.getElementById('saveMarqueeBtn').onclick = () => {
        setDoc(marqueeRef, { 
            text: document.getElementById('marqueeInput').value,
            text_en: document.getElementById('marqueeInputEn').value 
        }, { merge: true });
        closeModal('marqueeAdminModal');
    };

    // 4. البث المباشر
    const streamRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'stream');
    onSnapshot(streamRef, (snap) => {
        const d = snap.data();
        const display = document.getElementById('streamDisplay');
        const indicator = document.getElementById('liveIndicator');
        if(d?.active && d.code) {
            display.innerHTML = d.code;
            display.classList.remove('bg-black');
            indicator.classList.remove('hidden');
        } else {
            display.innerHTML = "لا يوجد بث مباشر حالياً";
            display.classList.add('bg-black');
            indicator.classList.add('hidden');
        }
    }, handleFirestoreError);

    document.getElementById('startStreamBtn').onclick = () => {
        const rawInput = document.getElementById('streamCodeInput').value;
        setDoc(streamRef, { active: true, code: processStreamInput(rawInput) }, { merge: true });
        closeModal('streamAdminModal');
    };
    document.getElementById('stopStreamBtn').onclick = () => {
        setDoc(streamRef, { active: false }, { merge: true });
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

// 3. العرض (مع الصورة في الأسفل)
    setupCollectionListener('news', 'newsContainer', (id, n) => {
        window.newsCache[id] = n; 

        const displayTitle = (currentLang === 'en' && n.title_en) ? n.title_en : n.title;
        const displayContent = (currentLang === 'en' && n.content_en) ? n.content_en : n.content;
        const alignClass = (currentLang === 'en' && n.title_en) ? 'text-left' : 'text-right';

        // تجهيز كود الصورة (إذا وجدت)
        let imageHTML = '';
        if (n.image && n.image.trim() !== "") {
            // لاحظ: غيرنا mb-4 إلى mt-4 لعمل مسافة فوق الصورة
            imageHTML = `<img src="${n.image}" class="w-full h-64 object-cover rounded-xl mt-4 border border-gray-100 shadow-sm" alt="News Image">`;
        }

        const el = document.createElement('div');
        el.className = `bg-white p-6 rounded-3xl shadow-sm border-r-4 border-blue-900 relative ${alignClass}`;
        el.innerHTML = `
            <div class="admin-only absolute left-4 top-4 flex gap-2 z-10">
                <button class="text-blue-600 text-xs font-bold bg-blue-50 px-2 py-1 rounded hover:bg-blue-100" onclick="editNews('${id}')">Edit</button>
                <button class="text-red-400 text-xs font-bold bg-red-50 px-2 py-1 rounded hover:bg-red-100" onclick="deleteDocById('news', '${id}')">Delete</button>
            </div>
            
            <h4 class="text-xl font-black text-blue-900 mb-2 mt-4">${displayTitle}</h4>
            <p class="text-gray-600 text-sm font-bold formatted-text">${displayContent}</p>
            
            ${imageHTML} `;
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

    // الإعلانات (محدث)
    setupCollectionListener('ads', 'adsContainer', (id, a) => {
        const displayTitle = (currentLang === 'en' && a.title_en) ? a.title_en : a.title;
        const alignClass = (currentLang === 'en' && a.title_en) ? 'flex-row-reverse' : 'flex-row'; // لعكس الأيقونة

        const el = document.createElement('div');
        el.className = `bg-purple-50 p-4 rounded-2xl flex justify-between items-center group ${alignClass}`;
        el.innerHTML = `
            <a href="${a.link || '#'}" target="_blank" class="text-purple-900 font-black text-sm hover:underline">📢 ${displayTitle}</a>
            <button class="admin-only text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition font-bold" onclick="deleteDocById('ads', '${id}')">Delete</button>
        `;
        return el;
    });

    // اللوائح (محدث)
    setupCollectionListener('rules', 'rulesContainer', (id, r) => {
        const displayTitle = (currentLang === 'en' && r.title_en) ? r.title_en : r.title;
        const alignClass = (currentLang === 'en' && r.title_en) ? 'flex-row-reverse' : 'flex-row';

        const el = document.createElement('div');
        el.className = `bg-indigo-50 p-4 rounded-2xl flex justify-between items-center group ${alignClass}`;
        el.innerHTML = `
            <a href="${r.link}" target="_blank" class="text-indigo-900 font-black text-sm hover:underline">📜 ${displayTitle}</a>
            <button class="admin-only text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition font-bold" onclick="deleteDocById('rules', '${id}')">Delete</button>
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

// تشغيل اللغة فور فتح الموقع
applyLanguage();

initAuthAndApp();