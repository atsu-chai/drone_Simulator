import { constants, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('Node.js 24以上が必要です。24系をインストールして再実行してください。');
  process.exit(1);
}

try {
  copyFileSync(
    fileURLToPath(new URL('../.env.example', import.meta.url)),
    fileURLToPath(new URL('../.env', import.meta.url)),
    constants.COPYFILE_EXCL,
  );
  console.log('.env を作成しました。初期設定では販売停止・決済キー未設定です。');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('既存の .env を保持しました。');
}

console.log(`Node.js ${process.versions.node} / 追加パッケージ不要`);
console.log('npm test と npm run check で確認後、npm start で起動してください。');
