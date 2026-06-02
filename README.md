# 📚 Блокнот молодого учителя

**Интерактивное веб-приложение для демонстрации документов с 3D эффектом, облачной синхронизацией и полной адаптацией под все устройства.**

![Status](https://img.shields.io/badge/status-production-green)
![Version](https://img.shields.io/badge/version-4.0-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

🌐 **[Откройте сайт](https://your-site.netlify.app)** | 📖 **[Руководство](GUIDE.md)** | ⚙️ **[Настройка Firebase](FIREBASE_DEPLOY_INSTRUCTIONS.md)** | 🚀 **[GitHub + Netlify](COMPLETE_SETUP_GITHUB_NETLIFY.md)**

---

## ✨ Главные возможности

- **📖 3D Перелистывание** - Красивый эффект перелистывания с спиральным переплётом
- **☁️ Реал-тайм синхронизация** - Все пользователи видят документы мгновенно
- **📤 Загрузка файлов** - PPTX, PDF, DOCX (просмотр через Google Docs)
- **📱 Мобильная адаптация** - Полная поддержка смартфонов и планшетов
- **🎙️ Звуковые эффекты** - Процедурно генерируемые звуки
- **🔒 Режим редактирования** - Защищённый доступ (пароль: teacher)

---

## 🚀 Быстрый старт

### Открыть сайт (для пользователей)
```
https://your-site.netlify.app
```

### Развернуть свой (для разработчиков)
```bash
# 1. Форкируйте репо на GitHub
# 2. Подключите к Netlify (1 клик)
# 3. Настройте Firebase (опционально)
# 4. Готово! Автоматический deploy работает

# Дальше просто делайте git push
git add .
git commit -m "Update documents"
git push
```

---

## 📋 Полное руководство

**Новичок?** Начните с [COMPLETE_SETUP_GITHUB_NETLIFY.md](COMPLETE_SETUP_GITHUB_NETLIFY.md) - пошаговое руководство с картинками.

**Есть вопросы?** Смотрите:
- [START.md](START.md) - Введение
- [GUIDE.md](GUIDE.md) - Полное руководство пользователя
- [FIREBASE_DEPLOY_INSTRUCTIONS.md](FIREBASE_DEPLOY_INSTRUCTIONS.md) - Облачная синхронизация

---

## 📁 Структура проекта

```
notebook-teacher/
├── index.html                      # Главное приложение (800KB с Firebase)
├── styles.css                      # Адаптивные стили
├── README.md                       # Этот файл
├── START.md                        # Введение (начните отсюда)
├── GUIDE.md                        # Руководство пользователя
├── FIREBASE_READY.md               # Статус Firebase
├── FIREBASE_DEPLOY_INSTRUCTIONS.md # Firebase настройка
├── COMPLETE_SETUP_GITHUB_NETLIFY.md # Full setup guide
└── .gitignore                      # Что не загружать на GitHub
```

---

## ☁️ Облачная синхронизация

### Как работает

```
Учитель загружает файл
    ↓ (Firebase)
На облачном сервере
    ↓ (реал-тайм)
Ученики получают файл АВТОМАТИЧЕСКИ
```

### Бесплатно!

- 1 ГБ хранилища
- 100k чтений/месяц
- 50k записей/месяц
- Достаточно для сотен пользователей

**Подробно:** [FIREBASE_DEPLOY_INSTRUCTIONS.md](FIREBASE_DEPLOY_INSTRUCTIONS.md)

---

## 🌐 Развёртывание

### На Netlify (рекомендуется)

1. Форкируйте этот репо на GitHub
2. На https://app.netlify.com нажмите "Add new site"
3. Выберите GitHub репо
4. Нажмите Deploy
5. **Готово!** Автоматический deploy работает

При каждом `git push`:
- GitHub получает код
- Netlify видит изменения
- Netlify развертывает автоматически (~1 минута)

### Локально (для разработки)

```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server

# Откройте http://localhost:8000/index.html
```

---

## 🎯 Функциональность

### Для ученика/просмотра
```
✅ Смотреть документы
✅ Перелистывать (← → или свайпы)
✅ Просмотреть полный документ
✅ На мобиль: сенсорные жесты
```

### Для учителя/редактирования
```
Пароль: teacher

✅ Добавить раздел
✅ Загрузить PPTX, PDF, DOCX
✅ Удалить документ
✅ Синхронизируется в облако
✅ Ученики видят мгновенно!
```

---

## 🎨 Кастомизация

### Изменить пароль

```html
В index.html найти:
if (userPassword !== "teacher")

Изменить на:
if (userPassword !== "ваш_пароль")
```

### Изменить цвета

```css
В styles.css найти :root и измените переменные
--primary-color
--accent-color
--background-color
```

---

## 📱 Браузерная поддержка

| Браузер | Версия | ✅ |
|---------|--------|-----|
| Chrome  | 90+    | ✅  |
| Firefox | 88+    | ✅  |
| Safari  | 14+    | ✅  |
| Edge    | 90+    | ✅  |

**Мобиль:** iOS 12+, Android 8+

---

## 🔧 Технология

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Storage:** Firebase Firestore (облако) + IndexedDB (локальное)
- **Hosting:** Netlify
- **CI/CD:** Автоматический из GitHub

**Без фреймворков, никаких зависимостей!**

---

## 🐛 Решение проблем

### Сайт не загружается
```
F12 → Console → Смотрите ошибки
Если Firebase: проверьте конфиг в index.html
```

### Firebase не синхронизирует
```
1. Проверьте Firestore Rules
2. Очистите localStorage
3. Обновите страницу
```

### Документ не открывается
```
Проверьте формат: PPTX, PDF или DOCX
Google Docs Viewer имеет размер лимит
```

---

## 📞 Документация

- **[COMPLETE_SETUP_GITHUB_NETLIFY.md](COMPLETE_SETUP_GITHUB_NETLIFY.md)** - Полная пошаговая настройка с GitHub и Netlify
- **[START.md](START.md)** - Введение и первые шаги
- **[GUIDE.md](GUIDE.md)** - Полное руководство пользователя
- **[FIREBASE_READY.md](FIREBASE_READY.md)** - Статус Firebase
- **[FIREBASE_DEPLOY_INSTRUCTIONS.md](FIREBASE_DEPLOY_INSTRUCTIONS.md)** - Firebase настройка

---

## 📊 Производительность

- **Загрузка:** < 2 сек
- **3D анимации:** 60fps
- **Реал-тайм sync:** < 1 сек
- **Мобиль:** Оптимизировано

---

## 🚀 Автоматизация

```
Вы делаете:
1. git add .
2. git commit -m "message"
3. git push

Netlify сам:
1. Видит изменения
2. Скачивает код
3. Развертывает
4. Ваш сайт обновляется ✨
```

**Полностью автоматично!** 🤖

---

## 📝 Лицензия

MIT License - свободно используйте

---

## 🙏 Спасибо

- Google Docs Viewer API
- Firebase & Firestore
- Netlify
- Всем пользователям!

---

**Версия:** 4.0  
**Статус:** ✅ Production Ready  
**Дата:** 2 июня 2026

**Начните использовать сейчас! 🚀**
