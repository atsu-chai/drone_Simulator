import { DatabaseSync } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const db=new DatabaseSync(resolve(root,'.data/service.sqlite'));
const [action,email,arg]=process.argv.slice(2);
if(action==='grant' && email && Number(arg)>0 && Number(arg)<=180) {
  const result=db.prepare('UPDATE accounts SET validation_until=? WHERE email=?').run(Math.floor(Date.now()/1000)+Number(arg)*86400,email.toLowerCase());console.log(result.changes?'検証利用期間を設定しました。':'登録アカウントが見つかりません。');
} else if(action==='requests') {
  console.log(JSON.stringify(db.prepare('SELECT * FROM requests ORDER BY created DESC').all(),null,2));
} else if(action==='reset-password' && email) {
  const password=randomBytes(18).toString('base64url'),salt=randomBytes(16).toString('hex');
  const user=db.prepare('SELECT id FROM accounts WHERE email=?').get(email.toLowerCase());
  if(!user) throw new Error('アカウントが見つかりません。');
  db.prepare('UPDATE accounts SET password=? WHERE id=?').run(`${salt}:${scryptSync(password,salt,64).toString('hex')}`,user.id);db.prepare('DELETE FROM sessions WHERE account_id=?').run(user.id);
  console.log(`本人確認と安全な伝達方法を確認してから利用者へ伝えてください。一時パスワード: ${password}`);
} else {console.log('Usage: node server/admin.js grant EMAIL DAYS | requests | reset-password EMAIL');process.exitCode=1;}
db.close();
