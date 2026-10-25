import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function run(cmd, options = {}) {
  return execSync(cmd, { cwd: repoRoot, encoding: 'utf-8', stdio: options.stdio || 'pipe', ...options });
}

async function main() {
  console.log('\x1b[36m=== novelaide リリース自動化スクリプト ===\x1b[0m');

  // コマンドライン引数のパース (npm run release -- [remote] [branch] [--dry-run] [--force])
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');
  const filteredArgs = args.filter((a) => !a.startsWith('--'));

  // 1. 未コミットの変更がないかチェック
  try {
    const status = run('git status --porcelain').trim();
    if (status) {
      console.error('\x1b[31mエラー: 作業ツリーに未コミットの変更があります。コミットまたはスタッシュしてから再実行してください。\x1b[0m');
      console.error(status);
      process.exit(1);
    }
  } catch (err) {
    console.error('git status の取得に失敗しました:', err.message);
    process.exit(1);
  }

  // 2. package.json からバージョンを取得
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const version = pkg.version;
  const tagName = `v${version}`;
  console.log(`\x1b[32m検出バージョン: ${version} (タグ: ${tagName})\x1b[0m`);

  // 3. ブランチの判定
  const branch = filteredArgs[1] || run('git rev-parse --abbrev-ref HEAD').trim();
  console.log(`対象ブランチ: ${branch}`);

  // 4. リモートリポジトリの判定
  let remote = filteredArgs[0];
  if (!remote) {
    try {
      const trackingRemote = run(`git config branch.${branch}.remote`).trim();
      if (trackingRemote) {
        remote = trackingRemote;
      }
    } catch {
      // トラッキングがない場合は一覧から探索
    }

    if (!remote) {
      const remotes = run('git remote')
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      if (remotes.includes('github')) {
        remote = 'github';
      } else if (remotes.includes('origin')) {
        remote = 'origin';
      } else if (remotes.length > 0) {
        remote = remotes[0];
      } else {
        console.error('\x1b[31mエラー: リモートリポジトリが設定されていません。\x1b[0m');
        process.exit(1);
      }
    }
  }

  let remoteUrl = '';
  try {
    remoteUrl = run(`git remote get-url ${remote}`).trim();
  } catch {
    remoteUrl = 'unknown';
  }
  console.log(`\x1b[33mプッシュ先リモート: ${remote} (${remoteUrl})\x1b[0m`);

  // 5. タグの既存チェック
  const existingTags = run(`git tag -l ${tagName}`).trim();
  if (existingTags) {
    if (isForce) {
      console.log(`\x1b[33m警告: タグ ${tagName} は既に存在します。--force により再作成します。\x1b[0m`);
      if (!isDryRun) {
        run(`git tag -d ${tagName}`);
      }
    } else {
      console.error(`\x1b[31mエラー: タグ ${tagName} は既にローカルに存在します。上書きする場合は --force を指定してください。\x1b[0m`);
      process.exit(1);
    }
  }

  if (isDryRun) {
    console.log('\n\x1b[35m[DryRun モード] 以下のコマンドが実行されます:\x1b[0m');
    console.log(`1. git tag -a ${tagName} -m "Release ${tagName}"`);
    console.log(`2. git push ${remote} ${branch}`);
    console.log(`3. git push ${remote} ${tagName}`);
    console.log('\n実際のタグ作成およびプッシュは行われませんでした。');
    process.exit(0);
  }

  // 6. タグの作成
  console.log(`\x1b[36mタグ ${tagName} を作成中...\x1b[0m`);
  run(`git tag -a ${tagName} -m "Release ${tagName}"`);

  // 7. リモートへのプッシュ
  console.log(`\x1b[36m${remote}/${branch} をプッシュ中...\x1b[0m`);
  run(`git push ${remote} ${branch}`, { stdio: 'inherit' });

  console.log(`\x1b[36mタグ ${tagName} を ${remote} へプッシュ中...\x1b[0m`);
  run(`git push ${remote} ${tagName}`, { stdio: 'inherit' });

  console.log('\n\x1b[32m✓ リリース処理が完了しました！ 🎉\x1b[0m');
  console.log('GitHub Actions のリリースワークフローが起動しました。');
  console.log('進捗および成果物は以下で確認できます:');
  console.log('https://github.com/mituha/novelaide/actions');
  console.log('https://github.com/mituha/novelaide/releases');
}

main().catch((err) => {
  console.error('\x1b[31mリリース処理中にエラーが発生しました:\x1b[0m', err.message);
  process.exit(1);
});
