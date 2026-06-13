        // ===== FIREBASE ИНИЦИАЛИЗАЦИЯ =====
        // Конфигурация загружается из config.js или fallback в index.html
        let firebaseDb = null;
        let isFirebaseReady = false;
        
        if (typeof firebase !== 'undefined' && firebaseConfig && firebaseConfig.apiKey) {
            try {
                firebase.initializeApp(firebaseConfig);
                firebaseDb = firebase.firestore();
                isFirebaseReady = true;
                console.log("✅ Firebase инициализирован!");
            } catch (e) {
                console.warn("⚠️ Firebase init failed:", e);
            }
        } else {
            console.warn("⚠️ Firebase не настроен. Работа в офлайн-режиме.");
        }

        // ===== ФУНКЦИИ СИНХРОНИЗАЦИИ С FIREBASE =====

        // Загрузить все файлы с Firebase
        async function syncWithFirebase() {
            if (!firebaseDb) {
                console.warn('[syncWithFirebase] firebaseDb не инициализирован, пропускаем');
                return;
            }
            try {
                console.log('[syncWithFirebase] Starting sync...');
                const snapshot = await firebaseDb.collection("documents").get();
                let count = 0;
                
                snapshot.forEach(doc => {
                    const fileObj = doc.data();
                    activeCustomDocuments[fileObj.name] = fileObj;
                    
                    // Сохраняем в IndexedDB, но не теряем base64 если он есть локально
                    const localData = localUploadedDocs[fileObj.name];
                    if (localData && localData.base64) {
                        fileObj.base64 = localData.base64;
                    }
                    saveDocToDB(fileObj.name, fileObj);
                    count++;
                });
                
                console.log(`✅ Синхронизировано ${count} файлов с Firebase. Active keys: ${Object.keys(activeCustomDocuments).length}`);
                isFirebaseReady = true;
                renderAllFilesLists();
                
            } catch (error) {
                console.error("⚠️ Firebase sync FAILED:", error);
                isFirebaseReady = false;
            }
        }

        // Слушать изменения в реальном времени
        let firebaseRenderTimeout;
        function listenToFirebaseChanges() {
            if (!firebaseDb) return;
            try {
                firebaseDb.collection("documents").onSnapshot(snapshot => {
                    snapshot.docChanges().forEach(change => {
                        const fileObj = change.doc.data();
                        if (change.type === 'removed') {
                            delete activeCustomDocuments[fileObj.name];
                            delete localUploadedDocs[fileObj.name];
                            deleteDocFromDB(fileObj.name);
                        } else {
                            activeCustomDocuments[fileObj.name] = fileObj;
                            // Сохраняем в IndexedDB, сохраняя base64
                            const localData = localUploadedDocs[fileObj.name];
                            if (localData && localData.base64) {
                                fileObj.base64 = localData.base64;
                            }
                            saveDocToDB(fileObj.name, fileObj);
                        }
                    });
                    
                    clearTimeout(firebaseRenderTimeout);
                    firebaseRenderTimeout = setTimeout(() => {
                        console.log("🔄 Получены обновления из Firebase!");
                        renderAllFilesLists();
                    }, 300);
                });
            } catch (error) {
                console.warn("⚠️ Реал-тайм синхронизация недоступна");
            }
        }

        // === СИНХРОНИЗАЦИЯ ПАПОК ЧЕРЕЗ FIREBASE ===
        async function syncFoldersWithFirebase() {
            if (!firebaseDb) return;
            try {
                // Сначала загружаем папки из Firebase
                const snapshot = await firebaseDb.collection("folders").get();
                snapshot.forEach(doc => {
                    const folder = doc.data();
                    if (!activeFolders.find(f => f.id === folder.id)) {
                        activeFolders.push(folder);
                        localFolders.push(folder);
                    }
                });
                
                // Затем сохраняем локальные папки, которых ещё нет в Firebase
                if (isFirebaseReady) {
                    for (const folder of localFolders) {
                        const doc = await firebaseDb.collection("folders").doc(folder.id).get();
                        if (!doc.exists) {
                            await firebaseDb.collection("folders").doc(folder.id).set(folder);
                        }
                    }
                }
                
                localStorage.setItem('local_teacher_notebook_folders', JSON.stringify(localFolders));
                console.log(`✅ Синхронизировано ${snapshot.size} папок с Firebase, локальных: ${localFolders.length}`);
            } catch (error) {
                console.error("⚠️ Firebase folders sync FAILED:", error);
            }
        }

        async function saveFolderToFirebase(folder) {
            if (!isFirebaseReady || !firebaseDb) return;
            try {
                await firebaseDb.collection("folders").doc(folder.id).set(folder);
            } catch (e) {
                console.error("Failed to save folder to Firebase:", e);
            }
        }

        async function deleteFolderFromFirebase(folderId) {
            if (!isFirebaseReady || !firebaseDb) return;
            try {
                await firebaseDb.collection("folders").doc(folderId).delete();
            } catch (e) {
                console.error("Failed to delete folder from Firebase:", e);
            }
        }

        let firebaseFolderRenderTimeout;
        function listenToFirebaseFolderChanges() {
            if (!firebaseDb) return;
            try {
                firebaseDb.collection("folders").onSnapshot(snapshot => {
                    snapshot.docChanges().forEach(change => {
                        const folder = change.doc.data();
                        if (change.type === 'removed') {
                            const idx = activeFolders.findIndex(f => f.id === folder.id);
                            if (idx > -1) activeFolders.splice(idx, 1);
                            localFolders = localFolders.filter(f => f.id !== folder.id);
                        } else {
                            if (!activeFolders.find(f => f.id === folder.id)) {
                                activeFolders.push(folder);
                                localFolders.push(folder);
                            }
                        }
                    });
                    localStorage.setItem('local_teacher_notebook_folders', JSON.stringify(localFolders));
                    
                    clearTimeout(firebaseFolderRenderTimeout);
                    firebaseFolderRenderTimeout = setTimeout(() => {
                        console.log("🔄 Получены обновления папок из Firebase!");
                        const savedNotes = document.getElementById("teacherNotes")?.value;
                        createPages();
                        applySpread();
                        renderAllFilesLists();
                        if (savedNotes !== undefined) {
                            const el = document.getElementById("teacherNotes");
                            if (el) el.value = savedNotes;
                        }
                    }, 300);
                });
            } catch (error) {
                console.warn("⚠️ Реал-тайм синхронизация папок недоступна");
            }
        }

        // Вспомогательная функция: base64 → Blob
        function base64ToBlob(base64, contentType = '') {
            const byteCharacters = atob(base64);
            const byteArrays = [];
            for (let offset = 0; offset < byteCharacters.length; offset += 512) {
                const slice = byteCharacters.slice(offset, offset + 512);
                const byteNumbers = new Array(slice.length);
                for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
                byteArrays.push(new Uint8Array(byteNumbers));
            }
            return new Blob(byteArrays, { type: contentType });
        }

        // Транслитерация русских букв в латиницу (Supabase не принимает кириллицу в именах файлов)
        function transliterate(str) {
            const map = {
                'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y',
                'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
                'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
                'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z','И':'I','Й':'Y',
                'К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F',
                'Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Shch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya'
            };
            return str.split('').map(c => map[c] || c).join('');
        }

        // Создать безопасное имя файла для Supabase (латиница + цифры + _ - .)
        function safeStorageName(filename) {
            const latin = transliterate(filename);
            return latin.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
        }

        // Загрузить файл в Supabase Storage + метаданные в Firestore
        async function uploadFileToSupabase(fileObj) {
            if (!isFirebaseReady) {
                console.warn("⚠️ Firebase не готов");
                return false;
            }
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
                console.warn("⚠️ Supabase не настроен");
                return false;
            }
            
            try {
                // 1. Создаём безопасное имя для Supabase
                const storageName = safeStorageName(fileObj.name);
                
                // 2. Конвертируем base64 в Blob и загружаем в Supabase
                const blob = base64ToBlob(fileObj.base64, fileObj.fileType || 'application/octet-stream');
                const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURIComponent(storageName)}`;
                
                const response = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': fileObj.fileType || 'application/octet-stream'
                    },
                    body: blob
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Supabase error response:', errorText);
                    throw new Error(`Supabase upload failed: ${response.status} - ${errorText}`);
                }
                
                // 3. Формируем публичный URL
                const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${encodeURIComponent(storageName)}`;
                
                // 4. Сохраняем метаданные в Firestore (без base64!)
                const docData = {
                    name: fileObj.name,           // оригинальное имя для отображения
                    storageName: storageName,     // имя в Supabase
                    url: publicUrl,
                    type: fileObj.fileType,
                    sectionId: fileObj.sectionId,
                    subfolderId: fileObj.subfolderId || '',
                    size: fileObj.size,
                    order: fileObj.order ?? 0,
                    uploadedAt: new Date().toISOString()
                };
                await firebaseDb.collection("documents").doc(fileObj.name).set(docData);
                
                // 5. Обновляем локальные данные
                activeCustomDocuments[fileObj.name] = docData;
                localUploadedDocs[fileObj.name] = docData;
                await saveDocToDB(fileObj.name, docData);
                
                console.log(`✅ "${fileObj.name}" → [${storageName}] загружен в Supabase`);
                return true;
            } catch (error) {
                console.error(`❌ Ошибка загрузки в Supabase:`, error);
                return false;
            }
        }

        // Удалить файл из Supabase Storage + Firestore
        async function deleteFileFromSupabase(filename) {
            if (!isFirebaseReady) return false;
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
                console.warn("⚠️ Supabase не настроен");
                return false;
            }
            
            try {
                // Определяем storageName (если файл был загружен ранее)
                const fileObj = activeCustomDocuments[filename];
                const storageName = fileObj && fileObj.storageName ? fileObj.storageName : safeStorageName(filename);
                
                // Удаляем из Supabase
                const deleteUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURIComponent(storageName)}`;
                await fetch(deleteUrl, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
                });
                
                // Удаляем метаданные из Firestore
                await firebaseDb.collection("documents").doc(filename).delete();
                
                console.log(`✅ "${filename}" удалён из Supabase`);
                return true;
            } catch (error) {
                console.error(`❌ Ошибка удаления из Supabase:`, error);
                return false;
            }
        }

        // ===== НАСТРОЙКИ ИНИЦИАЛИЗАЦИИ БАЗЫ ДАННЫХ INDEXEDDB =====
        const dbName = "TeacherNotebookDB";
        const storeName = "documents";
        let db;

        function initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(dbName, 1);
                request.onerror = (e) => reject(e);
                request.onsuccess = (e) => {
                    db = e.target.result;
                    resolve(db);
                };
                request.onupgradeneeded = (e) => {
                    const database = e.target.result;
                    database.createObjectStore(storeName, { keyPath: "name" });
                };
            });
        }

        function saveDocToDB(name, docObj) {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], "readwrite");
                const store = transaction.objectStore(storeName);
                const request = store.put({ name: name, data: docObj });
                request.onsuccess = () => resolve();
                request.onerror = (e) => reject(e);
            });
        }

        function getDocsFromDB() {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], "readonly");
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = (e) => {
                    const result = {};
                    e.target.result.forEach(item => {
                        result[item.name] = item.data;
                    });
                    resolve(result);
                };
                request.onerror = (e) => reject(e);
            });
        }

        function deleteDocFromDB(name) {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], "readwrite");
                const store = transaction.objectStore(storeName);
                const request = store.delete(name);
                request.onsuccess = () => resolve();
                request.onerror = (e) => reject(e);
            });
        }

        // === БАЗОВЫЕ НАСТРОЙКИ И ДАННЫЕ ===
        let currentSpread = 0;
        let isAnimating = false;
        let isAdminActive = false;

        // === ХРАНИЛИЩА ИЗМЕНЕНИЙ (ВШИВАЮТСЯ ПРИ ЭКСПОРТЕ) ===
        const USER_DOCUMENTS = {};
        const DELETED_DEFAULT_FILES = {};
        const EDITED_PAGE_HTML = {};
        const EMBEDDED_FOLDERS = [];

        // Объединяем дефолтные и добавленные пользователем документы
        const allDocuments = {};
        if (typeof EMBEDDED_DOCUMENTS !== 'undefined') {
            Object.assign(allDocuments, EMBEDDED_DOCUMENTS);
        }
        
        // Объединяем кастомные файлы из локальной сессии и вшитые
        const activeCustomDocuments = {};
        
        // Сначала берем вшитые авторские документы
        Object.keys(USER_DOCUMENTS).forEach(filename => {
            activeCustomDocuments[filename] = {
                base64: USER_DOCUMENTS[filename].base64 || USER_DOCUMENTS[filename],
                sectionId: USER_DOCUMENTS[filename].sectionId || "didaktika",
                subfolderId: USER_DOCUMENTS[filename].subfolderId || ""
            };
        });

        // Внутренний реестр динамических загрузок (синхронизируется с IndexedDB)
        let localUploadedDocs = {};
        let localDeletedDefaultFiles = {};
        let localEditedPageHTML = {};
        let localFolders = [];

        try {
            const savedDeleted = localStorage.getItem('local_teacher_deleted_files');
            if (savedDeleted) localDeletedDefaultFiles = JSON.parse(savedDeleted);
        } catch(e) { console.error(e); }

        try {
            const savedHtml = localStorage.getItem('local_teacher_notebook_html');
            if (savedHtml) localEditedPageHTML = JSON.parse(savedHtml);
        } catch(e) { console.error(e); }

        try {
            const savedFolders = localStorage.getItem('local_teacher_notebook_folders');
            if (savedFolders) localFolders = JSON.parse(savedFolders);
        } catch(e) { console.error(e); }

        // Активный список удаленных файлов, папок и измененных HTML страниц
        const activeDeletedDefaultFiles = Object.assign({}, DELETED_DEFAULT_FILES, localDeletedDefaultFiles);
        const activeEditedPageHTML = Object.assign({}, EDITED_PAGE_HTML, localEditedPageHTML);
        const activeFolders = [].concat(EMBEDDED_FOLDERS, localFolders);

        // Список разделов блокнота
        const SECTIONS = [
            { id: "didaktika", spread: 1 },
            { id: "mej_den", spread: 2 },
            { id: "ssylki", spread: 2 },
            { id: "pisateli", spread: 3 },
            { id: "vneklass", spread: 3 },
            { id: "reading", spread: 4 },
            { id: "soveti", spread: 4 },
            { id: "russkiy_jaz", spread: 5 },
            { id: "literatura", spread: 5 },
            { id: "notes", spread: 6 }
        ];

        // === ГЕНЕРАЦИЯ СОДЕРЖИМОГО СТРАНИЦ ===
        const pagesData = [
            // Sheet 0
            {
                type: 'cover',
                front: {
                    html: `
                        <div style="font-family:'Playfair Display', serif; font-size:15px; color:#c5a880; letter-spacing:1px; text-align:center; margin-bottom:8px; text-transform:uppercase;">ГУО «Гимназия № 22 г.Минска»</div>
                        <div style="font-family:'Montserrat', sans-serif; font-size:12px; color:rgba(255,255,255,0.5); letter-spacing:2px; text-align:center; margin-bottom:16px; text-transform:uppercase;">Ресурсный центр по русскому языку</div>
                        <div class="cover-logo"></div>
                        <div class="cover-title">Блокнот</div>
                        <div class="cover-title" style="font-size:26px; color:#d4af37;">молодого учителя</div>
                        <div class="cover-divider"></div>
                        <div style="font-family:'Caveat', cursive; font-size:24px; color:#c5a880;">Методическая копилка и личный дневник словесника</div>
                        <div style="margin-top:40px; font-size:12px; color:rgba(255,255,255,0.3); text-transform:uppercase; letter-spacing:1px;">Нажмите "Вперед" для просмотра страниц</div>
                    `
                },
                back: {
                    title: "Оглавление блокнота",
                    html: `
                        <p style="margin-bottom:18px;">В этом блокноте собраны ключевые материалы, шаблоны рабочих документов в соответствии с требованиями образования РБ и полезные советы для организации учебного процесса:</p>
                        <div class="toc-list">
                            <div class="toc-item" onclick="event.stopPropagation(); goToSpread(1)">
                                <span>1. Дидактические материалы</span><span class="toc-dots"></span><span class="toc-page">стр. 3</span>
                            </div>
                            <div class="toc-item" onclick="event.stopPropagation(); goToSpread(2)">
                                <span>2. Международный день на уроке</span><span class="toc-dots"></span><span class="toc-page">стр. 4</span>
                            </div>
                            <div class="toc-item" onclick="event.stopPropagation(); goToSpread(2)">
                                <span>3. Полезные ссылки</span><span class="toc-dots"></span><span class="toc-page">стр. 5</span>
                            </div>
                            <div class="toc-item" onclick="event.stopPropagation(); goToSpread(3)">
                                <span>4. Русские писатели на уроке</span><span class="toc-dots"></span><span class="toc-page">стр. 6</span>
                            </div>
                            <div class="toc-item" onclick="event.stopPropagation(); goToSpread(3)">
                                <span>5. Внеклассные мероприятия</span><span class="toc-dots"></span><span class="toc-page">стр. 7</span>
                            </div>
                            <div class="toc-item" onclick="event.stopPropagation(); goToSpread(4)">
                                <span>6. Советуем прочитать</span><span class="toc-dots"></span><span class="toc-page">стр. 8</span>
                            </div>
                            <div class="toc-item" onclick="event.stopPropagation(); goToSpread(4)">
                                <span>7. Советы молодому учителю</span><span class="toc-dots"></span><span class="toc-page">стр. 9</span>
                            </div>
                            <div class="toc-item" onclick="event.stopPropagation(); goToSpread(5)">
                                <span>8. Уроки русского языка</span><span class="toc-dots"></span><span class="toc-page">стр. 10</span>
                            </div>
                            <div class="toc-item" onclick="event.stopPropagation(); goToSpread(5)">
                                <span>9. Уроки русской литературы</span><span class="toc-dots"></span><span class="toc-page">стр. 11</span>
                            </div>
                            <div class="toc-item" onclick="event.stopPropagation(); goToSpread(6)">
                                <span>10. Личные заметки учителя</span><span class="toc-dots"></span><span class="toc-page">стр. 12</span>
                            </div>
                        </div>
                        <div class="post-it-note" style="margin-top:25px;">
                            💡 Вы можете быстро переходить по страницам блокнота, кликая по пунктам оглавления!
                        </div>
                    `
                }
            },
            // Sheet 1 (Раздел 1 и Раздел 2)
            {
                type: 'paper',
                front: {
                    sectionId: "didaktika",
                    title: "1. Дидактические материалы",
                    html: `
                        <p>Раздаточные и дидактические материалы позволяют индивидуализировать обучение и организовать самостоятельную работу учащихся. Разработка карточек должна учитывать 10-балльную систему оценки результатов учебной деятельности.</p>
                        <p><strong>Уровни усвоения учебного материала в школах РБ (для карточек):</strong></p>
                        <ul class="todo-list">
                            <li><strong>I-II уровни (1–4 балла)</strong> — Действия по узнаванию, воспроизведение по памяти.</li>
                            <li><strong>III уровень (5–6 баллов)</strong> — Применение знаний в знакомой ситуации (правила, разборы).</li>
                            <li><strong>IV-V уровни (7–10 баллов)</strong> — Творческое применение знаний.</li>
                        </ul>
                    `
                },
                back: {
                    sectionId: "mej_den",
                    title: "2. Международный день на уроке русского",
                    html: `
                        <p>Интеграция крупных праздников в учебный процесс способствует формированию социокультурной компетенции школьников и уважению к языковому разнообразию Республики Беларусь.</p>
                        <p><strong>Календарь важных дат для уроков словесности:</strong></p>
                        <ul class="todo-list">
                            <li><strong>Первое воскресенье сентября</strong> — День белорусской письменности</li>
                            <li><strong>21 февраля</strong> — Международный день родного языка</li>
                            <li><strong>24 мая</strong> — День славянской письменности и культуры</li>
                            <li><strong>6 июня</strong> — День русского языка (Пушкинский день)</li>
                        </ul>
                        <p><strong>Идеи активностей на уроке:</strong><br>
                        Сравнительно-лингвистический анализ схожих белорусских и русских фразеологизмов, исторический диктант «Путь Скорины».</p>
                    `
                }
            },
            // Sheet 2 (Раздел 3 и Раздел 4)
            {
                type: 'paper',
                front: {
                    sectionId: "ssylki",
                    title: "3. Полезные ссылки для словесника",
                    html: `
                        <p>Официальные интернет-ресурсы, порталы и базы данных Министерства образования Республики Беларусь, необходимые для ежедневной работы педагога:</p>
                        
                        <div style="margin-top: 15px; display:flex; flex-direction:column; gap:8px;">
                            <a href="https://adu.by" target="_blank" class="web-link">
                                <span class="web-link-icon">🌐</span>
                                <span class="web-link-title">Национальный образовательный портал</span>
                                <span class="web-link-desc">Учебные программы, КТП, учебники</span>
                            </a>
                            <a href="https://rikc.by" target="_blank" class="web-link">
                                <span class="web-link-icon">📚</span>
                                <span class="web-link-title">РИКЗ</span>
                                <span class="web-link-desc">Подготовка к ЦТ и ЦЭ (РИКЗ)</span>
                            </a>
                            <a href="https://edu.gov.by" target="_blank" class="web-link">
                                <span class="web-link-icon">📝</span>
                                <span class="web-link-title">Министерство образования РБ</span>
                                <span class="web-link-desc">Инструкции и правовые акты</span>
                            </a>
                            <a href="https://academy.edu.by" target="_blank" class="web-link">
                                <span class="web-link-icon">🖥️</span>
                                <span class="web-link-title">Академия образования</span>
                                <span class="web-link-desc">Повышение квалификации, аттестация</span>
                            </a>
                        </div>
                        <div class="post-it-note" style="margin-top: 25px;">
                            ⚠️ Портал "Adu.by" — ваш главный источник актуальных учебных программ и инструктивно-методических писем на текущий учебный год!
                        </div>
                    `
                },
                back: {
                    sectionId: "pisateli",
                    title: "4. Русские писатели на уроке русского",
                    html: `
                        <p>Изучение сложных тем грамматики и синтаксиса на живых классических текстах воспитывает безупречное языковое чутьё и культуру чтения.</p>
                        <div class="quote-box">«Берегите наш язык, наш прекрасный русский язык — это клад, это достояние, переданное нам нашими предшественниками!»<br><span style="font-size:18px; font-weight:600;">— И. С. Тургенев</span></div>
                        <p><strong>Межпредметные лингвистические связи:</strong></p>
                        <p>• <i>Лингвокультурология:</i> Анализ текстов русских классиков, живших или путешествовавших по Беларуси (например, пребывание А.С. Пушкина в Могилеве и Минске, творчество И.С. Тургенева, Н.А. Некрасова).</p>
                    `
                }
            },
            // Sheet 3 (Раздел 5 и Раздел 6)
            {
                type: 'paper',
                front: {
                    sectionId: "vneklass",
                    title: "5. Внеклассные мероприятия",
                    html: `
                        <p>Воспитательная и внеклассная работа в учреждениях общего среднего образования Республики Беларусь опирается на Программу непрерывного воспитания детей и учащейся молодежи.</p>
                        <div class="quote-box">«Ученик — это не сосуд, который нужно заполнить, а факел, который нужно зажечь».<br><span style="font-size:18px; font-weight:600;">— Плутарх</span></div>
                        <p><strong>Чек-лист классных дел на четверть:</strong></p>
                        <ul class="todo-list">
                            <li>Определить темы классных и обязательных информационных часов</li>
                            <li>Провести анкетирование увлечений и кружков</li>
                            <li>Выбрать актив класса (староста, физорг, сектор правопорядка)</li>
                            <li>Спланировать посещение знаковых мест Беларуси (экскурсионная программа)</li>
                        </ul>
                    `
                },
                back: {
                    sectionId: "reading",
                    title: "6. Советуем прочитать",
                    html: `
                        <p>Рекомендуемая литература для профессионального развития педагогов-словесников Беларуси:</p>
                        <ul class="todo-list" style="margin-bottom:15px;">
                            <li><strong>К.И. Чуковский «Живой как жизнь»</strong><br><span style="font-size:13px; color:#555;">Классическая книга о культуре, развитии и чистоте речи.</span></li>
                            <li><strong>Нора Галь «Слово живое и мёртвое»</strong><br><span style="font-size:13px; color:#555;">О борьбе с канцелярским языком и сохранении естественности речи.</span></li>
                            <li><strong>Научно-методический журнал «Русский язык и литература»</strong><br><span style="font-size:13px; color:#555;">Официальное периодическое издание для белорусских учителей.</span></li>
                        </ul>
                        <div class="post-it-note">
                            📌 Изучайте методические сборники Национального института образования на портале adu.by!
                        </div>
                    `
                }
            },
            // Sheet 4 (Раздел 7 и Раздел 8)
            {
                type: 'paper',
                front: {
                    sectionId: "soveti",
                    title: "7. Советы молодому учителю",
                    html: `
                        <p>Профессиональный старт в школе требует знания нормативной базы и грамотного выстраивания отношений с учащимися и коллегами.</p>
                        <p><strong>Памятка молодого педагога РБ:</strong></p>
                        <ul class="todo-list">
                            <li><strong>Кодекс Республики Беларусь об образовании</strong> — ваш главный нормативный правовой ориентир в профессиональной деятельности.</li>
                            <li><strong>Единый речевой режим</strong> — строго контролируйте оформление письменных работ, тетрадей и дневников учащихся.</li>
                            <li><strong>Классный журнал</strong> — ведите записи аккуратно, в строгом соответствии с Инструкцией Министерства образования РБ.</li>
                        </ul>
                        <div class="post-it-note">
                            🛡️ Совет: Каждый урок должен начинаться с проверки готовности рабочих мест и правильной осанки учащихся!
                        </div>
                    `
                },
                back: {
                    sectionId: "russkiy_jaz",
                    title: "8. Уроки русского языка",
                    html: `
                        <p>Обучение русскому языку в школах Беларуси опирается на формирование языковой, речевой, коммуникативной и лингвокультурологической компетенций.</p>
                        <p><strong>Методические основы проведения урока:</strong></p>
                        <p>• <i>Официальное планирование:</i> Урок должен строго соответствовать учебной программе и календарно-тематическому планированию (КТП).<br>
                        • <i>Контроль знаний:</i> Проводится в соответствии с «Нормами оценки результатов учебной деятельности учащихся по учебному предмету «Русский язык».</p>
                    `
                }
            },
            // Sheet 5 (Раздел 9 и Раздел 10)
            {
                type: 'paper',
                front: {
                    sectionId: "literatura",
                    title: "9. Уроки русской литературы",
                    html: `
                        <p>Урок литературы — это пространство нравственного развития личности, сотворчества и осмысления духовного опыта поколений.</p>
                        <p>Основная цель учебного предмета «Русская литература» — развитие у учащихся читательской грамотности, эстетического вкуса и гуманистического мировоззрения.</p>
                        <div class="quote-box">«Чтение — это один из истоков мышления и умственного развития».<br><span style="font-size:18px; font-weight:600;">— В. А. Сухомлинский</span></div>
                        <p><strong>Белорусские контексты на уроках русской литературы:</strong><br>
                        Сравнительный анализ произведений русских и белорусских писателей на общие темы (например, темы Великой Отечественной войны у В. Быкова и Б. Васильева).</p>
                    `
                },
                back: {
                    sectionId: "notes",
                    title: "10. Мои личные заметки",
                    html: `
                        <p>Вы можете использовать это поле как свой персональный дневник для записей идей, планов на уроки и профессиональных наблюдений:</p>
                        <textarea class="notes-textarea" id="teacherNotes" placeholder="Напишите здесь свои заметки (текст сохраняется автоматически)..." oninput="saveNotes()"></textarea>
                        <div style="margin-top:20px; border-top:1px dashed #c5a880; padding-top:10px; font-size:12px; color:#64748b;">
                            ⚡ Записи сохраняются локально в вашем браузере.
                        </div>
                    `
                }
            },
            // Sheet 6
            {
                type: 'backcover',
                front: {
                    html: `
                        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; text-align:center;">
                            <div class="cover-logo" style="margin-bottom:20px;"></div>
                            <div class="cover-title" style="font-size:26px; letter-spacing:1px; margin-bottom:10px;">Блокнот</div>
                            <div class="cover-title" style="font-size:20px; color:#d4af37; margin-bottom:20px;">молодого учителя</div>
                            <div class="cover-divider" style="margin-bottom:25px; width:100px;"></div>
                            <p style="font-size:14px; color:#94a3b8; line-height:22px;">«Учитель соприкасается с вечностью: он никогда не может сказать, где заканчивается его влияние».</p>
                        </div>
                    `
                },
                back: {
                    html: `
                        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; text-align:center; color:#888;">

                            <div style="font-family:'Playfair Display', serif; font-size:22px; color:#c5a880; margin-bottom:10px;">Конец блокнота</div>
                            <div style="font-size:13px; color:rgba(255,255,255,0.25);">&copy; 2026</div>
                        </div>
                    `
                }
            }
        ];

        // Соответствие файлов по умолчанию разделам (пусто — только пользовательские файлы)
        const defaultFilesMapping = {};

        const totalSpreads = pagesData.length;

        // === ИНИЦИАЛИЗАЦИЯ И ПОСТРОЕНИЕ БЛОКНОТА ===
        function createSpiral() {
            const spine = document.getElementById('spiralSpine');
            spine.innerHTML = '';
            for (let i = 0; i < 20; i++) {
                const ring = document.createElement('div');
                ring.className = 'spiral-ring';
                spine.appendChild(ring);
            }
        }

        function createPages() {
            const container = document.getElementById('pagesContainer');
            container.innerHTML = '';
            const ceAttr = isAdminActive ? 'contenteditable="true"' : '';

            pagesData.forEach((sheet, index) => {
                const pageSheet = document.createElement('div');
                pageSheet.className = `page-sheet`;
                pageSheet.dataset.index = index;
                pageSheet.onclick = (e) => handleSheetClick(index, e);

                // FRONT Face
                const frontFace = document.createElement('div');
                if (sheet.type === 'cover') {
                    frontFace.className = 'face front cover-front';
                    frontFace.innerHTML = sheet.front.html + `<div class="metal-corner top-right"></div><div class="metal-corner bottom-right"></div>`;
                } else if (sheet.type === 'backcover') {
                    frontFace.className = 'face front cover-front';
                    frontFace.innerHTML = sheet.front.html + `<div class="metal-corner top-right"></div><div class="metal-corner bottom-right"></div>`;
                } else {
                    frontFace.className = 'face front paper-face';
                    
                    const sectionId = sheet.front.sectionId;
                    let textBodyHTML = `
                        <div class="page-header">${sheet.front.title}</div>
                        <div class="page-text-body">${sheet.front.html}</div>
                    `;
                    if (activeEditedPageHTML[sectionId]) {
                        textBodyHTML = activeEditedPageHTML[sectionId];
                    }

                    // Генерация папок для этой страницы
                    let foldersHTML = '';
                    const pageFolders = activeFolders.filter(f => f.sectionId === sectionId);
                    pageFolders.forEach(folder => {
                        foldersHTML += `
                            <div class="subfolder-container">
                                <div class="subfolder-header">
                                    <span class="subfolder-icon">📁</span>
                                    <span class="subfolder-title">${folder.label}</span>
                                    ${isAdminActive ? `<button class="delete-btn" style="opacity:1; right:15px; width:22px; height:22px; font-size:12px;" onclick="deleteCustomFolder('${folder.id}')" title="Удалить папку">&times;</button>` : ''}
                                </div>
                                <div class="subfolder-body">
                                    <div class="files-section" data-section="${sectionId}" data-subfolder="${folder.id}" style="border:none; background:none; padding:0; margin:0;">
                                        <div class="files-list"></div>
                                    </div>
                                </div>
                            </div>
                        `;
                    });

                    frontFace.innerHTML = `
                        <div class="page-scroll-content">
                            <div class="editable-content" data-page-id="${sectionId}" ${ceAttr}>
                                ${textBodyHTML}
                            </div>
                            
                            <div class="files-section" data-section="${sectionId}" data-subfolder="">
                                <div class="files-section-title">📂 Общие материалы</div>
                                <div class="files-list"></div>
                            </div>

                            ${foldersHTML}

                            ${isAdminActive ? `
                                <button class="nav-btn" style="background:#10b981; margin:15px 0 5px 0; width:100%; justify-content:center; border-color:#059669;" onclick="createCustomFolder('${sectionId}')">➕ Создать новую папку</button>
                            ` : ''}
                        </div>
                        <div class="page-number">${index * 2 + 1}</div>
                        <div class="spine-gradient"></div>
                        <div class="holes"></div>
                    `;
                }

                // BACK Face
                const backFace = document.createElement('div');
                if (sheet.type === 'cover') {
                    backFace.className = 'face back paper-face';
                    
                    const sectionId = "toc"; // Оглавление
                    let textBodyHTML = `
                        <div class="page-header">${sheet.back.title}</div>
                        <div class="page-text-body">${sheet.back.html}</div>
                    `;
                    if (activeEditedPageHTML[sectionId]) {
                        textBodyHTML = activeEditedPageHTML[sectionId];
                    }

                    backFace.innerHTML = `
                        <div class="page-scroll-content">
                            <div class="editable-content" data-page-id="${sectionId}" ${ceAttr}>
                                ${textBodyHTML}
                            </div>
                            <div class="files-section" data-section="${sectionId}" data-subfolder="" style="display:none;">
                                <div class="files-list"></div>
                            </div>
                        </div>
                        <div class="page-number">${index * 2 + 2}</div>
                        <div class="spine-gradient"></div>
                        <div class="holes"></div>
                    `;
                } else if (sheet.type === 'backcover') {
                    backFace.className = 'face back cover-back';
                    backFace.innerHTML = sheet.back.html + `<div class="metal-corner top-left"></div><div class="metal-corner bottom-left"></div>`;
                } else {
                    backFace.className = 'face back paper-face back';
                    
                    const sectionId = sheet.back.sectionId;
                    let textBodyHTML = `
                        <div class="page-header">${sheet.back.title}</div>
                        <div class="page-text-body">${sheet.back.html}</div>
                    `;
                    if (activeEditedPageHTML[sectionId]) {
                        textBodyHTML = activeEditedPageHTML[sectionId];
                    }

                    // Генерация папок для этой страницы
                    let foldersHTML = '';
                    const pageFolders = activeFolders.filter(f => f.sectionId === sectionId);
                    pageFolders.forEach(folder => {
                        foldersHTML += `
                            <div class="subfolder-container">
                                <div class="subfolder-header">
                                    <span class="subfolder-icon">📁</span>
                                    <span class="subfolder-title">${folder.label}</span>
                                    ${isAdminActive ? `<button class="delete-btn" style="opacity:1; right:15px; width:22px; height:22px; font-size:12px;" onclick="deleteCustomFolder('${folder.id}')" title="Удалить папку">&times;</button>` : ''}
                                </div>
                                <div class="subfolder-body">
                                    <div class="files-section" data-section="${sectionId}" data-subfolder="${folder.id}" style="border:none; background:none; padding:0; margin:0;">
                                        <div class="files-list"></div>
                                    </div>
                                </div>
                            </div>
                        `;
                    });

                    backFace.innerHTML = `
                        <div class="page-scroll-content">
                            <div class="editable-content" data-page-id="${sectionId}" ${ceAttr}>
                                ${textBodyHTML}
                            </div>
                            
                            <div class="files-section" data-section="${sectionId}" data-subfolder="">
                                <div class="files-section-title">📂 Общие материалы</div>
                                <div class="files-list"></div>
                            </div>

                            ${foldersHTML}

                            ${isAdminActive ? `
                                <button class="nav-btn" style="background:#10b981; margin:15px 0 5px 0; width:100%; justify-content:center; border-color:#059669;" onclick="createCustomFolder('${sectionId}')">➕ Создать новую папку</button>
                            ` : ''}
                        </div>
                        <div class="page-number">${index * 2 + 2}</div>
                        <div class="spine-gradient"></div>
                        <div class="holes"></div>
                    `;
                }

                // Заполняем отверстия hole-punch
                const holesFront = frontFace.querySelector('.holes');
                const holesBack = backFace.querySelector('.holes');
                if (holesFront) {
                    for (let h = 0; h < 20; h++) {
                        const punch = document.createElement('div');
                        punch.className = 'hole-punch';
                        holesFront.appendChild(punch);
                    }
                }
                if (holesBack) {
                    for (let h = 0; h < 20; h++) {
                        const punch = document.createElement('div');
                        punch.className = 'hole-punch';
                        holesBack.appendChild(punch);
                    }
                }

                pageSheet.appendChild(frontFace);
                pageSheet.appendChild(backFace);
                container.appendChild(pageSheet);
            });
        }

        // === НАВИГАЦИЯ И ПЕРЕЛИСТЫВАНИЕ СТРАНИЦ ===
        function updateZIndices() {
            const sheets = document.querySelectorAll('.page-sheet');
            sheets.forEach((sheet, i) => {
                const index = parseInt(sheet.dataset.index);
                if (index < currentSpread) {
                    // Перелистанные страницы — чем ближе к текущей, тем выше
                    sheet.style.zIndex = index + 1;
                } else if (index === currentSpread) {
                    // Текущая страница — всегда сверху
                    sheet.style.zIndex = totalSpreads + 10;
                } else {
                    // Неперелистанные страницы после текущей — убывают
                    sheet.style.zIndex = totalSpreads - index;
                }
            });
        }

        function updateNavigationUI() {
            document.getElementById('prevBtn').disabled = currentSpread <= 0;
            document.getElementById('nextBtn').disabled = currentSpread >= totalSpreads;

            const leftPageNum = currentSpread > 0 ? currentSpread * 2 : '-';
            const rightPageNum = currentSpread < totalSpreads ? currentSpread * 2 + 1 : '-';

            document.getElementById('spreadIndicator').textContent = 
                `Разворот ${currentSpread} из ${totalSpreads} (стр. ${leftPageNum} – ${rightPageNum})`;
        }

        function playFlipSound() {
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const duration = 0.22;
                const sampleRate = audioCtx.sampleRate;
                const bufferSize = sampleRate * duration;
                const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
                const data = buffer.getChannelData(0);

                let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    b0 = 0.99886 * b0 + white * 0.0555179;
                    b1 = 0.99332 * b1 + white * 0.0750759;
                    b2 = 0.96900 * b2 + white * 0.1538520;
                    b3 = 0.86650 * b3 + white * 0.3104856;
                    b4 = 0.55000 * b4 + white * 0.5329522;
                    b5 = -0.7616 * b5 - white * 0.0168980;
                    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
                    b6 = white * 0.115926;
                }

                const noise = audioCtx.createBufferSource();
                noise.buffer = buffer;

                const filter = audioCtx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(2500, audioCtx.currentTime);
                filter.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + duration);
                filter.Q.value = 0.5;

                const gain = audioCtx.createGain();
                gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);
                noise.start();
            } catch(e) { console.error("Web Audio API not allowed yet."); }
        }

        function applySpread() {
            const sheets = document.querySelectorAll('.page-sheet');
            sheets.forEach((sheet, i) => {
                if (i < currentSpread) {
                    sheet.classList.add('flipped');
                } else {
                    sheet.classList.remove('flipped');
                }
            });
            updateZIndices();
            updateNavigationUI();
        }

        // Анимация пера при перелистывании
        function animatePen() {
            const pen = document.getElementById('fountainPen');
            const trail = document.getElementById('inkTrail');
            if (!pen || !trail) return;
            
            pen.classList.remove('writing');
            trail.classList.remove('visible');
            void pen.offsetWidth;
            
            pen.classList.add('writing');
            trail.classList.add('visible');
            
            setTimeout(() => {
                trail.classList.remove('visible');
            }, 1600);
        }

        function nextSpread() {
            if (currentSpread >= totalSpreads || isAnimating) return;
            isAnimating = true;
            animatePen();
            playFlipSound();

            const sheets = document.querySelectorAll('.page-sheet');
            const sheet = sheets[currentSpread];
            sheet.classList.add('flipped');
            sheet.style.zIndex = currentSpread + 1;

            currentSpread++;
            setTimeout(() => {
                updateZIndices();
                updateNavigationUI();
                resetPageScroll();
                isAnimating = false;
            }, 600);
        }

        // Предыдущий разворот
        function prevSpread() {
            if (currentSpread <= 0 || isAnimating) return;
            isAnimating = true;
            animatePen();
            playFlipSound();

            currentSpread--;
            const sheets = document.querySelectorAll('.page-sheet');
            const sheet = sheets[currentSpread];
            sheet.classList.remove('flipped');
            sheet.style.zIndex = totalSpreads - currentSpread;

            setTimeout(() => {
                updateZIndices();
                updateNavigationUI();
                resetPageScroll();
                isAnimating = false;
            }, 600);
        }

        // Перейти на определенный разворот
        function goToSpread(spread) {
            if (spread < 0 || spread > totalSpreads || isAnimating) return;
            if (spread === currentSpread) return;
            isAnimating = true;
            animatePen();
            playFlipSound();

            const sheets = document.querySelectorAll('.page-sheet');
            if (spread > currentSpread) {
                let i = currentSpread;
                function flipNext() {
                    if (i >= spread) {
                        currentSpread = spread;
                        updateZIndices();
                        updateNavigationUI();
                        resetPageScroll();
                        isAnimating = false;
                        return;
                    }
                    sheets[i].classList.add('flipped');
                    sheets[i].style.zIndex = i + 1;
                    i++;
                    setTimeout(flipNext, 200);
                }
                flipNext();
            } else {
                let i = currentSpread - 1;
                function flipPrev() {
                    if (i < spread) {
                        currentSpread = spread;
                        updateZIndices();
                        updateNavigationUI();
                        resetPageScroll();
                        isAnimating = false;
                        return;
                    }
                    sheets[i].classList.remove('flipped');
                    sheets[i].style.zIndex = totalSpreads - i;
                    i--;
                    setTimeout(flipPrev, 200);
                }
                flipPrev();
            }
        }

        // НОВОЕ: Вернуться на начало блокнота
        function goToHome() {
            if (currentSpread === 0 || isAnimating) return;
            isAnimating = true;
            animatePen();
            playFlipSound();

            const sheets = document.querySelectorAll('.page-sheet');
            let count = currentSpread;
            
            function flipBack() {
                if (count <= 0) {
                    currentSpread = 0;
                    updateZIndices();
                    updateNavigationUI();
                    isAnimating = false;
                    return;
                }
                sheets[count - 1].classList.remove('flipped');
                count--;
                setTimeout(flipBack, 150);
            }
            flipBack();
        }

        function handleSheetClick(sheetIndex, e) {
            if (isAnimating) return;
            if (e.target.closest('a') || e.target.closest('button') || e.target.closest('textarea') || e.target.closest('.upload-zone') || e.target.closest('.editable-content') || e.target.closest('.page-scroll-content') || e.target.closest('.files-section') || e.target.closest('.subfolder-container')) {
                return;
            }

            const isFlipped = e.currentTarget.classList.contains('flipped');
            if (!isFlipped && sheetIndex === currentSpread) {
                nextSpread();
            } else if (isFlipped && sheetIndex === currentSpread - 1) {
                prevSpread();
            }
        }

        // Клавиатурные стрелки
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.closest('[contenteditable="true"]')) return;
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                nextSpread();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prevSpread();
            }
        });

        // Сброс прокрутки при смене разворота
        function resetPageScroll() {
            document.querySelectorAll('.page-scroll-content').forEach(el => {
                el.scrollTop = 0;
            });
        }

        // НОВОЕ: Wheel-прокрутка для внутреннего содержимого страниц блокнота
        document.addEventListener('wheel', (e) => {
            // Если фокус в input/textarea/contenteditable — не перехватываем
            const target = e.target;
            if (!target || !target.closest) return;
            if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.closest('[contenteditable="true"]')) return;

            // Определяем левую/правую страницу по положению курсора относительно центра блокнота.
            // Иначе правая страница (больший z-index) перехватывает прокрутку левой у корешка.
            const book = document.querySelector('.book');
            if (!book) return;
            const bookRect = book.getBoundingClientRect();
            const onLeftHalf = e.clientX < bookRect.left + bookRect.width / 2;

            const x = e.clientX;
            const y = e.clientY;
            let scrollContainer = null;

            document.querySelectorAll('.page-scroll-content').forEach(candidate => {
                const sheet = candidate.closest('.page-sheet');
                if (!sheet) return;

                const index = parseInt(sheet.dataset.index);
                const isFlipped = sheet.classList.contains('flipped');
                const isActiveLeft = (index === currentSpread - 1 && isFlipped);
                const isActiveRight = (index === currentSpread && !isFlipped);
                if (onLeftHalf ? !isActiveLeft : !isActiveRight) return;

                const rect = candidate.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    scrollContainer = candidate;
                }
            });
            if (!scrollContainer) return;

            const canScrollDown = scrollContainer.scrollTop + scrollContainer.clientHeight < scrollContainer.scrollHeight - 1;
            const canScrollUp = scrollContainer.scrollTop > 0;

            // Если контейнер можно прокрутить в направлении wheel — прокручиваем его
            if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
                e.preventDefault();
                scrollContainer.scrollTop += e.deltaY;
            }
        }, { passive: false });

        // === ИНТЕРАКТИВНЫЕ ЗАМЕТКИ ===
        function saveNotes() {
            const val = document.getElementById('teacherNotes').value;
            localStorage.setItem('local_teacher_notes', val);
        }

        function loadNotes() {
            const val = localStorage.getItem('local_teacher_notes');
            const el = document.getElementById('teacherNotes');
            if (val && el) {
                el.value = val;
            }
        }

        // === ОТКРЫТИЕ ФАЙЛОВ В МОДАЛЬНОМ ОКНЕ ===
        function openFile(filename) {
            const fileObj = activeCustomDocuments[filename] || allDocuments[filename];
            
            if (!fileObj) {
                alert(`Файл "${filename}" не найден.`);
                return;
            }

            document.getElementById('docViewerTitle').textContent = filename;
            const frame = document.getElementById('docViewerFrame');

            // Если есть URL из Supabase — открываем через онлайн-просмотрщики
            if (fileObj.url) {
                let viewerUrl;
                if (filename.endsWith('.pdf')) {
                    viewerUrl = fileObj.url;
                } else if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
                    // Word — Microsoft Office Online + cache-buster чтобы не было белого экрана
                    viewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileObj.url)}&cb=${Date.now()}`;
                } else {
                    // PowerPoint — Microsoft Office Online Viewer
                    viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileObj.url)}&cb=${Date.now()}`;
                }
                
                // Сначала очищаем iframe, потом загружаем новый URL
                frame.src = 'about:blank';
                setTimeout(() => {
                    frame.src = viewerUrl;
                }, 150);
                
                document.getElementById('docViewerModal').style.display = 'flex';
                return;
            }
            
            // Fallback для старых файлов с base64 (без URL)
            alert('Файл ещё не синхронизирован с облаком. Подождите или загрузите заново.');
        }

        // Закрыть модальное окно просмотра документа
        function closeDocViewer() {
            document.getElementById('docViewerModal').style.display = 'none';
            const frame = document.getElementById('docViewerFrame');
            frame.src = 'about:blank';
            frame.removeAttribute('srcdoc');
        }

        // === ОТРИСОВКА СПИСКОВ ФАЙЛОВ НА СТРАНИЦАХ ===
        
        function getFileIconClass(filename) {
            const lower = filename.toLowerCase();
            if (lower.endsWith('.pdf')) return 'pdf';
            if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return 'pptx';
            if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
            return '';
        }
        
        function getFileIconText(filename) {
            const lower = filename.toLowerCase();
            if (lower.endsWith('.pdf')) return 'PDF';
            if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return 'PPTX';
            if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'DOCX';
            return 'FILE';
        }
        
        function renderAllFilesLists() {
            let totalFiles = 0;
            document.querySelectorAll('.files-section').forEach(section => {
                const sectionId = section.dataset.section;
                const subfolderId = section.dataset.subfolder || "";
                const listEl = section.querySelector('.files-list');
                if (!listEl) return;
                listEl.innerHTML = '';

                // Файлы по умолчанию (только если subfolderId пустой)
                const defaultFiles = defaultFilesMapping[sectionId] || [];
                
                // Объединенный список файлов для этого подраздела
                const allFilesForSection = [];
                
                if (subfolderId === "") {
                    defaultFiles.forEach(filename => {
                        const isDeleted = activeDeletedDefaultFiles[filename] || localDeletedDefaultFiles[filename];
                        if (!isDeleted) {
                            allFilesForSection.push({ name: filename, isCustom: false });
                        }
                    });
                }

                // Добавляем файлы, добавленные автором
                Object.keys(activeCustomDocuments).forEach(filename => {
                    const doc = activeCustomDocuments[filename];
                    const docSubfolder = doc.subfolderId || "";
                    if (doc.sectionId === sectionId && docSubfolder === subfolderId) {
                        allFilesForSection.push({ name: filename, isCustom: true });
                    }
                });

                // Сортируем: сначала по порядку выбора (order), затем по имени
                allFilesForSection.sort((a, b) => {
                    const orderA = a.isCustom ? (activeCustomDocuments[a.name]?.order ?? 0) : 0;
                    const orderB = b.isCustom ? (activeCustomDocuments[b.name]?.order ?? 0) : 0;
                    if (orderA !== orderB) return orderA - orderB;
                    return a.name.localeCompare(b.name);
                });

                totalFiles += allFilesForSection.length;
                if (allFilesForSection.length === 0) {
                    listEl.innerHTML = '<div style="font-size:12px; color:#94a3b8; font-style:italic; padding:6px 0;">Нет доступных материалов</div>';
                } else {
                    allFilesForSection.forEach(file => {
                        const filename = file.name;
                        const isCustom = file.isCustom;
                        const sizeText = isCustom ? 'Загружен автором' : '1.2 КБ (Шаблон)';
                        
                        const card = document.createElement('div');
                        card.className = 'doc-card';
                        const iconClass = getFileIconClass(filename);
                        const iconText = getFileIconText(filename);
                        
                        card.innerHTML = `
                            <div class="doc-card-icon ${iconClass}">${iconText}</div>
                            <div class="doc-card-info" onclick="event.stopPropagation(); openFile('${filename}')" style="cursor:pointer;">
                                <div class="doc-card-name" title="${filename}">${filename}</div>
                                <div class="doc-card-size">${sizeText}</div>
                            </div>
                            <div class="doc-card-download" onclick="event.stopPropagation(); openFile('${filename}')" style="cursor:pointer;" title="Открыть">
                                👁️
                            </div>
                            ${isAdminActive ? `<button class="delete-btn" onclick="event.stopPropagation(); deleteFile('${filename}', '${sectionId}', ${isCustom})" title="Удалить файл">&times;</button>` : ''}
                        `;
                        listEl.appendChild(card);
                    });
                }

                // Добавляем зону массовой загрузки файлов, если включен режим админа
                if (isAdminActive) {
                    const uploadZone = document.createElement('div');
                    uploadZone.className = 'upload-zone';
                    uploadZone.innerHTML = `
                        <span class="upload-text">📎 Прикрепить файлы: DOCX, PPTX, PDF (массово)</span>
                        <input type="file" accept=".doc,.docx,.rtf,.pptx,.pdf" multiple onchange="handleAuthorFileUpload(this, '${sectionId}', '${subfolderId}')">
                    `;
                    listEl.appendChild(uploadZone);
                }
            });
            console.log(`[renderAllFilesLists] total sections rendered, custom docs count: ${Object.keys(activeCustomDocuments).length}, files in lists: ${totalFiles}`);
        }

        // Удаление файла (любого: как своего, так и предустановленного)
        async function deleteFile(filename, sectionId, isCustom) {
            event.stopPropagation();
            if (confirm(`Вы действительно хотите удалить файл "${filename}" из раздела?`)) {
                if (isCustom) {
                    delete localUploadedDocs[filename];
                    delete activeCustomDocuments[filename];
                    
                    // Удаляем из IndexedDB
                    await deleteDocFromDB(filename);
                    
                    // Удаляем с Firebase
                    if (isFirebaseReady) {
                        await deleteFileFromSupabase(filename);
                    }
                    
                    renderAllFilesLists();
                } else {
                    localDeletedDefaultFiles[filename] = true;
                    localStorage.setItem('local_teacher_deleted_files', JSON.stringify(localDeletedDefaultFiles));
                    renderAllFilesLists();
                }
            }
        }

        // Создание новой папки динамически
        function createCustomFolder(sectionId) {
            event.stopPropagation();
            const folderName = prompt("Введите название новой папки:");
            if (!folderName) return;
            const folderId = "folder_" + Date.now();
            
            const newFolder = {
                id: folderId,
                label: folderName,
                sectionId: sectionId
            };
            localFolders.push(newFolder);
            localStorage.setItem('local_teacher_notebook_folders', JSON.stringify(localFolders));
            activeFolders.push(newFolder);
            
            saveFolderToFirebase(newFolder);

            // Перерисовываем и рендерим
            createPages();
            applySpread();
            renderAllFilesLists();
        }

        // Удаление созданной папки
        function deleteCustomFolder(folderId) {
            event.stopPropagation();
            if (confirm("Вы действительно хотите удалить эту папку и все файлы внутри нее?")) {
                // Удаляем саму папку из локального и активного списков
                localFolders = localFolders.filter(f => f.id !== folderId);
                localStorage.setItem('local_teacher_notebook_folders', JSON.stringify(localFolders));
                
                const activeIndex = activeFolders.findIndex(f => f.id === folderId);
                if (activeIndex > -1) activeFolders.splice(activeIndex, 1);
                
                deleteFolderFromFirebase(folderId);

                // Удаляем файлы из этой папки
                const deletePromises = [];
                Object.keys(activeCustomDocuments).forEach(filename => {
                    if (activeCustomDocuments[filename].subfolderId === folderId) {
                        delete activeCustomDocuments[filename];
                        delete localUploadedDocs[filename];
                        deletePromises.push(deleteDocFromDB(filename));
                        if (isFirebaseReady) deletePromises.push(deleteFileFromSupabase(filename));
                    }
                });

                Promise.all(deletePromises).then(() => {
                    createPages();
                    applySpread();
                    renderAllFilesLists();
                }).catch(e => console.error(e));
            }
        }

        // === РЕЖИМ АВТОРА (АДМИН-ПАНЕЛЬ) ===
        function toggleAdminMode() {
            if (isAdminActive) {
                isAdminActive = false;
                document.getElementById('adminLock').classList.remove('unlocked');
                document.getElementById('adminBanner').style.display = 'none';
                
                document.querySelectorAll('.editable-content').forEach(el => {
                    el.setAttribute('contenteditable', 'false');
                });

                createPages();
                applySpread();
                renderAllFilesLists();
                playFlipSound();
            } else {
                const pass = prompt("Введите пароль для активации режима автора");
                if (pass === 'teacher22') {
                    isAdminActive = true;
                    document.getElementById('adminLock').classList.add('unlocked');
                    document.getElementById('adminBanner').style.display = 'flex';
                    
                    document.querySelectorAll('.editable-content').forEach(el => {
                        el.setAttribute('contenteditable', 'true');
                    });

                    createPages();
                    applySpread();
                    renderAllFilesLists();
                    playFlipSound();
                } else if (pass !== null) {
                    alert("Неверный пароль автора!");
                }
            }
        }

        // Обработка массовой загрузки файлов автором
        async function handleAuthorFileUpload(input, sectionId, subfolderId = "") {
            const files = input.files;
            if (!files || files.length === 0) return;

            let loadedCount = 0;
            const totalFiles = files.length;

            for (let i = 0; i < totalFiles; i++) {
                const file = files[i];
                const reader = new FileReader();
                reader.onload = async function(e) {
                    const fullBase64 = e.target.result;
                    const cleanBase64 = fullBase64.split(',')[1];

                    const fileObj = {
                        name: file.name,
                        base64: cleanBase64,
                        sectionId: sectionId,
                        subfolderId: subfolderId,
                        fileType: file.type,
                        size: file.size,
                        uploadedAt: new Date().toISOString(),
                        order: i
                    };

                    // Сохраняем локально в IndexedDB
                    localUploadedDocs[file.name] = fileObj;
                    activeCustomDocuments[file.name] = fileObj;
                    await saveDocToDB(file.name, fileObj);

                    // Загружаем на Firebase
                    console.log(`[upload] ${file.name} - isFirebaseReady=${isFirebaseReady}`);
                    if (isFirebaseReady) {
                        await uploadFileToSupabase(fileObj);
                    } else {
                        console.warn("⚠️ Firebase не готов, файл сохранён только локально");
                    }

                    loadedCount++;
                    if (loadedCount === totalFiles) {
                        renderAllFilesLists();
                    }
                };
                reader.readAsDataURL(file);
            }
        }

        // Экспорт блокнота в self-contained index.html с сохранением ВСЕХ файлов и текстов!
        function exportNotebookHTML() {
            // Читаем все документы из базы данных IndexedDB
            getDocsFromDB().then(dbDocs => {
                const compiledUserDocs = {};
                
                // Вшиваем то, что уже было вшито при прошлых экспортах
                Object.keys(USER_DOCUMENTS).forEach(filename => {
                    compiledUserDocs[filename] = {
                        base64: USER_DOCUMENTS[filename].base64 || USER_DOCUMENTS[filename],
                        sectionId: USER_DOCUMENTS[filename].sectionId || "didaktika",
                        subfolderId: USER_DOCUMENTS[filename].subfolderId || ""
                    };
                });

                // Затем добавляем новые файлы из IndexedDB
                Object.keys(dbDocs).forEach(filename => {
                    compiledUserDocs[filename] = {
                        base64: dbDocs[filename].base64,
                        sectionId: dbDocs[filename].sectionId,
                        subfolderId: dbDocs[filename].subfolderId || ""
                    };
                });

                const compiledDeletedFiles = Object.assign({}, DELETED_DEFAULT_FILES, localDeletedDefaultFiles);
                const compiledPageHTML = Object.assign({}, EDITED_PAGE_HTML, localEditedPageHTML);

                // Выполняем "чистую" DOM-сериализацию, чтобы сбросить временные состояния перед скачиванием!
                const wasAdmin = isAdminActive;
                const oldSpread = currentSpread;
                
                // 1. Временно отключаем режим автора для очистки разметки
                if (isAdminActive) {
                    isAdminActive = false;
                    document.getElementById('adminLock').classList.remove('unlocked');
                    document.getElementById('adminBanner').style.display = 'none';
                    document.querySelectorAll('.editable-content').forEach(el => {
                        el.setAttribute('contenteditable', 'false');
                    });
                }
                
                // 2. Временно закрываем блокнот к титульной странице
                currentSpread = 0;
                applySpread();
                createPages();
                renderAllFilesLists(); // Чистые списки без скрепок, инпутов и крестиков
                
                // 3. Сериализуем итоговую чистую разметку
                let serializedHTML = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
                
                // 4. Восстанавливаем состояние автора
                isAdminActive = wasAdmin;
                currentSpread = oldSpread;
                if (isAdminActive) {
                    document.getElementById('adminLock').classList.add('unlocked');
                    document.getElementById('adminBanner').style.display = 'flex';
                    document.querySelectorAll('.editable-content').forEach(el => {
                        el.setAttribute('contenteditable', 'true');
                    });
                }
                applySpread();
                createPages();
                renderAllFilesLists();

                // 5. Вшиваем данные в переменные внутри кода экспортируемого HTML!
                serializedHTML = serializedHTML.replace(/const USER_DOCUMENTS\s*=\s*\{[^\}]*\};/, `const USER_DOCUMENTS = ${JSON.stringify(compiledUserDocs, null, 4)};`);
                serializedHTML = serializedHTML.replace(/const DELETED_DEFAULT_FILES\s*=\s*\{[^\}]*\};/, `const DELETED_DEFAULT_FILES = ${JSON.stringify(compiledDeletedFiles, null, 4)};`);
                serializedHTML = serializedHTML.replace(/const EDITED_PAGE_HTML\s*=\s*\{[^\}]*\};/, `const EDITED_PAGE_HTML = ${JSON.stringify(compiledPageHTML, null, 4)};`);
                serializedHTML = serializedHTML.replace(/const EMBEDDED_FOLDERS\s*=\s*\[[^\]]*\];/, `const EMBEDDED_FOLDERS = ${JSON.stringify(activeFolders, null, 4)};`);

                // 6. Скачиваем готовый файл
                const blob = new Blob([serializedHTML], { type: "text/html;charset=utf-8" });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = "index.html";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                alert("Блокнот успешно экспортирован! Все ваши тексты, созданные папки и прикрепленные файлы вшиты внутрь страницы. Теперь вы можете отправлять этот файл index.html коллегам.");
            }).catch(err => {
                console.error(err);
                alert("Ошибка при экспорте данных блокнота.");
            });
        }

        // === СТАРТ ПРИЛОЖЕНИЯ ===
        initDB().then(async () => {
            console.log('[init] DB ready, starting Firebase sync...');
            // Синхронизируемся с Firebase
            await syncWithFirebase();
            listenToFirebaseChanges();
            await syncFoldersWithFirebase();
            listenToFirebaseFolderChanges();
            
            // Читаем загруженные документы из IndexedDB и объединяем
            const dbDocs = await getDocsFromDB();
            
            Object.keys(dbDocs).forEach(filename => {
                activeCustomDocuments[filename] = dbDocs[filename];
                localUploadedDocs[filename] = dbDocs[filename];
            });

            createSpiral();
            createPages();
            applySpread();
            loadNotes();
            renderAllFilesLists();
            
            // Анимация пера при первом открытии блокнота
            setTimeout(animatePen, 1200);
        }).catch(err => {
            console.error("Database initialization failed", err);
            // Fallback
            createSpiral();
            createPages();
            applySpread();
            loadNotes();
            renderAllFilesLists();
            
            setTimeout(animatePen, 1200);
        });
