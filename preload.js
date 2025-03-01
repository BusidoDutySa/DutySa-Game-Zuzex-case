const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  // Экспортируем функции для взаимодействия с основным процессом
  window.api = {
    login: (username, password) => {
      return new Promise((resolve) => {
        ipcRenderer.send('login', { username, password });
        ipcRenderer.once('login-response', (_, response) => {
          resolve(response);
        });
      });
    },
    
    register: (username, password, profileImage) => {
      return new Promise((resolve) => {
        ipcRenderer.send('register', { username, password, profileImage });
        ipcRenderer.once('register-response', (_, response) => {
          resolve(response);
        });
      });
    },
    
    updateWins: (userId, wins) => {
      return new Promise((resolve) => {
        ipcRenderer.send('update-wins', { userId, wins });
        ipcRenderer.once('update-wins-response', (_, response) => {
          resolve(response);
        });
      });
    },
    
    updateProfileImage: (userId, profileImage) => {
      return new Promise((resolve) => {
        ipcRenderer.send('update-profile-image', { userId, profileImage });
        ipcRenderer.once('update-profile-image-response', (_, response) => {
          resolve(response);
        });
      });
    },
    
    getProfileImagePath: (imagePath) => {
      if (!imagePath) return null;
      return `file://${__dirname}/${imagePath}`;
    }
  };
}); 