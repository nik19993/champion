// Builds the real application components with an isolated browser-local SQL transport.
// Usage: node scripts/build-review-preview.mjs /path/to/esbuild/lib/main.js /path/to/pglite/dist/index.js
import { readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { historicalFiles, reviewBootstrap } from "./lib/review-schema.mjs";
const root=fileURLToPath(new URL("../",import.meta.url)),out=join(root,"review-dist");
const esbuildModule=resolve(process.argv[2]),pgliteModule=resolve(process.argv[3]);
const { build }=await import(pathToFileURL(esbuildModule).href);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
let sql=reviewBootstrap;
for(const file of historicalFiles)sql+="\n"+await readFile(join(root,"supabase/migrations",file),"utf8");
for(const file of (await readdir(join(root,"supabase/proposals"))).filter(file=>file.endsWith(".sql")).sort())sql+="\n"+await readFile(join(root,"supabase/proposals",file),"utf8");
sql+="\n"+await readFile(join(root,"review/seed.sql"),"utf8");
await writeFile(join(out,"review-schema.sql"),sql);
await build({entryPoints:[join(root,"review/index.jsx")],outfile:join(out,"review.js"),bundle:true,minify:true,format:"esm",platform:"browser",target:"es2022",jsx:"automatic",tsconfig:join(root,"tsconfig.json"),nodePaths:[join(dirname(dirname(esbuildModule)),"..")],define:{"process.env.NODE_ENV":'"production"',"process.env.NEXT_PUBLIC_APP_ENV":'"local"'},alias:{"@electric-sql/pglite":pgliteModule,"@electric-sql/pglite/contrib/btree_gist":join(dirname(pgliteModule),"contrib/btree_gist.js"),"next/image":join(root,"tests/ui/image-stub.jsx")}});
for(const file of ["pglite.wasm","initdb.wasm","pglite.data","btree_gist.tar.gz"])await cp(join(dirname(pgliteModule),file),join(out,file));
await cp(join(root,"public/templates"),join(out,"templates"),{recursive:true});
await cp(join(root,"public/champion-club-emblem.jpg"),join(out,"champion-club-emblem.jpg"));
await writeFile(join(out,"style.css"),(await readFile(join(root,"app/globals.css"),"utf8"))+"\n"+(await readFile(join(root,"review/review.css"),"utf8")));
await writeFile(join(out,"index.html"),'<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Клуб Чемпіон — приватна перевірка</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/review.js"></script></body></html>');
await writeFile(join(out,"sample-tasks.csv"),'\uFEFFфаза;рівень;вік_від;вік_до;назва;опис\nНапад;Індивідуальна;6;8;Нові ігрові завдання U6–U8;Контроль м’яча та орієнтування\nНапад;Групова;9;12;Нове відкривання U9–U12;Запропонувати себе партнеру з м’ячем\nЗахист;Командна;13;17;Новий груповий пресинг U13–U17;Узгодити напрямок тиску\n');
await writeFile(join(out,"sample-terms.csv"),'\uFEFFтермін;визначення;категорія\nВідкривання;Створення можливості для взаємодії з партнером;Групова тактика нападу\nПресинг;Узгоджений тиск на суперника;Групова тактика захисту\n');
console.log("Built private review: real components + browser-local PostgreSQL, synthetic records only.");
