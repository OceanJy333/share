const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 数据库文件路径
const dbPath = path.join(__dirname, '../db/html-go.db');

// 确保数据库目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 创建数据库连接
const db = new sqlite3.Database(dbPath);

// 初始化数据库
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 创建页面表
      db.run(`
        CREATE TABLE IF NOT EXISTS pages (
          id TEXT PRIMARY KEY,
          html_content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          password TEXT,
          is_protected INTEGER DEFAULT 0,
          code_type TEXT DEFAULT 'html',
          expires_at INTEGER,
          view_password TEXT
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('数据库表创建/检查完成');

          // 迁移：为现有表添加新字段（如果不存在）
          db.all("PRAGMA table_info(pages)", (err, columns) => {
            if (err) {
              reject(err);
              return;
            }

            const hasExpiresAt = columns.some(col => col.name === 'expires_at');
            const hasViewPassword = columns.some(col => col.name === 'view_password');

            const migrations = [];
            if (!hasExpiresAt) {
              migrations.push("ALTER TABLE pages ADD COLUMN expires_at INTEGER");
            }
            if (!hasViewPassword) {
              migrations.push("ALTER TABLE pages ADD COLUMN view_password TEXT");
            }

            if (migrations.length > 0) {
              console.log('执行数据库迁移...');
              Promise.all(migrations.map(sql =>
                new Promise((res, rej) => {
                  db.run(sql, err => err ? rej(err) : res());
                })
              )).then(() => {
                console.log('数据库迁移完成');
                resolve();
              }).catch(reject);
            } else {
              console.log('数据库初始化成功');
              resolve();
            }
          });
        }
      });
    });
  });
}

// 执行查询的辅助函数
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 执行单行查询的辅助函数
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// 执行更新的辅助函数
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

module.exports = {
  db,
  initDatabase,
  query,
  get,
  run
};
