const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');

// Создаем директорию для хранения фотографий профилей, если она не существует
const profileImagesDir = path.join(__dirname, 'profile_images');
if (!fs.existsSync(profileImagesDir)) {
  fs.mkdirSync(profileImagesDir);
}

// Создаем базу данных
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Ошибка при открытии базы данных', err.message);
  } else {
    console.log('Подключение к базе данных установлено');
    // Создаем таблицу пользователей, если она не существует
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      wins INTEGER DEFAULT 0,
      profile_image TEXT
    )`);
  }
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenu(null);

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// Обработка авторизации
ipcMain.on('login', (event, { username, password }) => {
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
    if (err) {
      event.reply('login-response', { success: false, message: 'Ошибка базы данных' });
      return;
    }
    
    if (!row) {
      event.reply('login-response', { success: false, message: 'Пользователь не найден' });
      return;
    }
    
    bcrypt.compare(password, row.password, (err, result) => {
      if (err) {
        event.reply('login-response', { success: false, message: 'Ошибка проверки пароля' });
        return;
      }
      
      if (result) {
        event.reply('login-response', { 
          success: true, 
          user: { 
            id: row.id, 
            username: row.username, 
            wins: row.wins,
            profileImage: row.profile_image
          } 
        });
      } else {
        event.reply('login-response', { success: false, message: 'Неверный пароль' });
      }
    });
  });
});

// Обработка регистрации
ipcMain.on('register', (event, { username, password, profileImage }) => {
  // Проверяем, существует ли пользователь
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
    if (err) {
      console.error('Ошибка при проверке существования пользователя:', err);
      fs.appendFileSync('registration_errors.txt', `Ошибка базы данных: ${err.message}\n`);
      event.reply('register-response', { success: false, message: 'Ошибка базы данных' });
      return;
    }
    
    if (row) {
      const errorMessage = 'Пользователь уже существует';
      console.error(errorMessage);
      fs.appendFileSync('registration_errors.txt', `${errorMessage}\n`);
      event.reply('register-response', { success: false, message: errorMessage });
      return;
    }
    
    // Хешируем пароль
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        console.error('Ошибка хеширования пароля:', err);
        fs.appendFileSync('registration_errors.txt', `Ошибка хеширования пароля: ${err.message}\n`);
        event.reply('register-response', { success: false, message: 'Ошибка хеширования пароля' });
        return;
      }
      
      let profileImagePath = null;
      
      // Если есть изображение профиля, сохраняем его
      if (profileImage) {
        try {
          // Проверяем, что profileImage - это строка
          if (typeof profileImage !== 'string') {
            const errorMessage = `Ошибка: profileImage не является строкой: ${typeof profileImage}`;
            console.error(errorMessage);
            fs.appendFileSync('registration_errors.txt', `${errorMessage}\n`);
            // Продолжаем регистрацию без изображения
          } else {
            console.log('Получено изображение профиля, длина строки:', profileImage.length);
            
            // Проверяем, что строка начинается с data:image
            if (!profileImage.startsWith('data:image')) {
              const errorMessage = 'Ошибка: profileImage не является корректной строкой base64';
              console.error(errorMessage);
              fs.appendFileSync('registration_errors.txt', `${errorMessage}\n`);
              // Продолжаем регистрацию без изображения
            } else {
              // Удаляем префикс data:image/...;base64, из строки base64
              const base64Data = profileImage.replace(/^data:image\/\w+;base64,/, '');
              
              // Проверяем, что директория существует
              if (!fs.existsSync(profileImagesDir)) {
                console.log('Создаем директорию для изображений профилей');
                fs.mkdirSync(profileImagesDir, { recursive: true });
              }
              
              // Создаем уникальное имя файла
              const fileName = `${username}_${Date.now()}.png`;
              profileImagePath = path.join('profile_images', fileName);
              const fullPath = path.join(__dirname, profileImagePath);
              
              console.log('Сохраняем изображение профиля в:', fullPath);
              
              // Сохраняем изображение
              fs.writeFileSync(fullPath, base64Data, 'base64');
              console.log('Изображение профиля успешно сохранено:', profileImagePath);
            }
          }
        } catch (error) {
          console.error('Ошибка при сохранении изображения профиля:', error);
          fs.appendFileSync('registration_errors.txt', `Ошибка при сохранении изображения профиля: ${error.message}\n`);
          // Продолжаем регистрацию даже если не удалось сохранить изображение
          profileImagePath = null;
        }
      }
      
      // Добавляем пользователя в базу данных
      db.run('INSERT INTO users (username, password, profile_image) VALUES (?, ?, ?)', 
        [username, hash, profileImagePath], function(err) {
        if (err) {
          console.error('Ошибка при создании пользователя:', err);
          fs.appendFileSync('registration_errors.txt', `Ошибка при создании пользователя: ${err.message}\n`);
          event.reply('register-response', { success: false, message: 'Ошибка при создании пользователя' });
          return;
        }
        
        console.log('Пользователь успешно создан:', username, 'с ID:', this.lastID);
        event.reply('register-response', { 
          success: true, 
          userId: this.lastID,
          profileImage: profileImagePath
        });
      });
    });
  });
});

// Обновление фото профиля
ipcMain.on('update-profile-image', (event, { userId, profileImage }) => {
  // Получаем информацию о пользователе
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
    if (err || !row) {
      event.reply('update-profile-image-response', { success: false, message: 'Пользователь не найден' });
      return;
    }
    
    // Удаляем старое изображение, если оно существует
    if (row.profile_image) {
      try {
        const oldImagePath = path.join(__dirname, row.profile_image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      } catch (error) {
        console.error('Ошибка при удалении старого изображения:', error);
        // Продолжаем обновление даже если не удалось удалить старое изображение
      }
    }
    
    let profileImagePath = null;
    
    // Сохраняем новое изображение
    if (profileImage) {
      try {
        // Удаляем префикс data:image/...;base64, из строки base64
        const base64Data = profileImage.replace(/^data:image\/\w+;base64,/, '');
        // Создаем уникальное имя файла
        const fileName = `${row.username}_${Date.now()}.png`;
        profileImagePath = path.join('profile_images', fileName);
        
        // Сохраняем изображение
        fs.writeFileSync(path.join(__dirname, profileImagePath), base64Data, 'base64');
      } catch (error) {
        console.error('Ошибка при сохранении изображения профиля:', error);
        event.reply('update-profile-image-response', { success: false, message: 'Ошибка при сохранении изображения' });
        return;
      }
    }
    
    // Обновляем запись в базе данных
    db.run('UPDATE users SET profile_image = ? WHERE id = ?', [profileImagePath, userId], (err) => {
      if (err) {
        event.reply('update-profile-image-response', { success: false, message: 'Ошибка обновления профиля' });
        return;
      }
      
      event.reply('update-profile-image-response', { 
        success: true, 
        profileImage: profileImagePath 
      });
    });
  });
});

// Обновление счета побед
ipcMain.on('update-wins', (event, { userId, wins }) => {
  db.run('UPDATE users SET wins = ? WHERE id = ?', [wins, userId], (err) => {
    if (err) {
      event.reply('update-wins-response', { success: false, message: 'Ошибка обновления счета' });
      return;
    }
    
    event.reply('update-wins-response', { success: true });
  });
}); 