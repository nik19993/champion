// Usage: node scripts/verify-readiness-ui.mjs ESBUILD_MODULE PLAYWRIGHT_MODULE CHROMIUM_PATH
// Synthetic adapter only; browser requests to other origins are rejected.
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
const { build }=await import(pathToFileURL(resolve(process.argv[2])).href);
const { chromium }=await import(pathToFileURL(resolve(process.argv[3])).href);
const directory=await mkdtemp(join(tmpdir(),"champion-readiness-ui-"));
let browser,checks=0;
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
try {
  const bundle=join(directory,"fixture.js"),ui=join(root,"tests/ui");
  await build({entryPoints:[join(ui,"readiness-fixture.jsx")],outfile:bundle,bundle:true,format:"iife",platform:"browser",jsx:"automatic",tsconfig:join(root,"tsconfig.json"),define:{"process.env.NODE_ENV":'"test"',"process.env.NEXT_PUBLIC_APP_ENV":'"local"'},alias:{"next/image":join(ui,"image-stub.jsx"),"@/lib/supabase/client":join(ui,"readiness-auth-client.js"),"@/components/auth/login-form":join(ui,"readiness-login.jsx"),"@/components/auth/password-change":join(ui,"readiness-password.jsx"),"@/components/layout/app-shell":join(ui,"readiness-shell.jsx")}});
  const js=await readFile(bundle),css=await readFile(join(root,"app/globals.css"));
  browser=await chromium.launch({executablePath:resolve(process.argv[4]),headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/*",route=>{
    const url=new URL(route.request().url());assert.equal(url.origin,"https://readiness-check.test");
    if(url.pathname==="/fixture.js")return route.fulfill({body:js,contentType:"application/javascript"});
    if(url.pathname==="/style.css")return route.fulfill({body:css,contentType:"text/css"});
    return route.fulfill({body:'<!doctype html><html lang="uk"><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="auth"></div><div id="coach-inventory"></div><div id="admin-inventory"></div><div id="uniform"></div><div id="export"></div><script src="/fixture.js"></script></html>',contentType:"text/html"});
  });
  const password=page.locator("#auth").getByRole("button",{name:"Змінити тестовий пароль",exact:true});
  await page.goto("https://readiness-check.test");await password.waitFor();
  await password.click();await page.getByText("Тестовий тренер А",{exact:true}).waitFor();
  check(await password.count(),0,"A finished the password flow");
  await page.evaluate(()=>window.readinessQa.emit("TOKEN_REFRESHED",{user:{id:"coach-a"}}));
  check(await password.count(),0,"same-user token refresh preserves completion");
  await page.getByRole("button",{name:"Тестовий вихід",exact:true}).click();
  await page.getByRole("button",{name:"Увійти тестовим Б",exact:true}).click();await password.waitFor();
  check(await page.getByText("Тестовий тренер Б",{exact:true}).count(),0,"B cannot inherit A's password completion");
  await page.evaluate(()=>window.readinessQa.lastComplete());
  check(await password.count(),1,"late completion from A cannot unlock B");
  await password.click();await page.getByText("Тестовий тренер Б",{exact:true}).waitFor();checks++;
  await page.reload();await password.waitFor();checks++;
  // Newer login must beat both an earlier profile response and getSession result.
  await page.evaluate(()=>{window.readinessQa.delayProfile="coach-b";window.readinessQa.login("coach-b");});
  await page.waitForFunction(()=>Boolean(window.readinessQa.pendingProfiles["coach-b"]));
  await page.evaluate(()=>{window.readinessQa.profiles["coach-a"].must_change_password=false;window.readinessQa.login("coach-a");});
  await page.getByText("Тестовий тренер А",{exact:true}).waitFor();
  await page.evaluate(()=>window.readinessQa.pendingProfiles["coach-b"]());
  check(await page.getByText("Тестовий тренер А",{exact:true}).count(),1,"stale profile cannot replace current user");
  await page.goto("https://readiness-check.test/#session-race");
  await page.reload();
  await page.waitForFunction(()=>Boolean(window.readinessQa.sessionRelease));
  await page.evaluate(()=>window.readinessQa.login("coach-b"));await password.waitFor();
  await page.evaluate(()=>window.readinessQa.sessionRelease());
  await password.click();await page.getByText("Тестовий тренер Б",{exact:true}).waitFor();checks++;
  await page.getByRole("button",{name:"Тестовий вихід",exact:true}).click();
  await page.getByRole("button",{name:"Увійти тестовим Б",exact:true}).click();await password.waitFor();checks++;

  await page.locator("#coach-inventory").getByRole("tab",{name:"Інвентаризація",exact:true}).click();
  const surfaces=[
    {id:"coach-inventory",table:"inventory_items",input:page.locator("#coach-inventory .inventory-list").getByLabel("Кількість",{exact:true}),value:"9"},
    {id:"admin-inventory",table:"inventory_items",input:page.locator("#admin-inventory").getByLabel("Тестовий інвентар: quantity",{exact:true}),value:"11"},
    {id:"uniform",table:"uniform_requests",input:page.locator("#uniform").getByLabel("Коментар",{exact:true}),value:"Тестовий коментар"},
  ];
  for(const surface of surfaces){
    const region=page.locator(`#${surface.id}`);
    await surface.input.fill(surface.value);
    for(const mode of ["null","wrong","error"]){
      await page.evaluate(({table,mode})=>window.readinessQa.modes[table]=mode,{table:surface.table,mode});
      await region.getByRole("button",{name:/^(Зберегти|Повторити)$/}).click();
      await region.locator(".save-state-label.error").waitFor();
      check(await region.locator(".save-state-label.saved").count(),0,`${surface.id}: no false success for ${mode}`);
      check(await surface.input.inputValue(),surface.value,`${surface.id}: draft preserved for ${mode}`);
    }
    await page.evaluate(table=>window.readinessQa.modes[table]="success",surface.table);
    await region.getByRole("button",{name:"Повторити",exact:true}).click();
    await region.locator(".save-state-label.saved").waitFor();checks++;
    await page.evaluate(table=>window.readinessQa.modes[table]="null",surface.table);
    await region.getByRole("button",{name:"Скасувати останню зміну",exact:true}).click();
    await region.locator(".save-state-label.error").waitFor();
    check(await surface.input.inputValue(),surface.value,`${surface.id}: failed undo keeps saved value`);
  }
  // Failure late in an encrypted export must not trigger a download/audit insert.
  let downloads=0;page.on("download",()=>downloads++);
  page.on("dialog",dialog=>dialog.accept("synthetic-strong-passphrase"));
  await page.evaluate(()=>{const from=window.readinessQa.client.from;window.readinessQa.client.from=table=>{if(table==="venues")return {select(){return this;},order(){return this;},range(){return Promise.resolve({data:null,error:{message:"denied"},count:null});}};return from(table);};});
  await page.locator("#export").getByRole("button",{name:"Зашифрований JSON",exact:true}).click();
  await page.locator("#export").getByText(/Файл не створено/).waitFor();
  check(downloads,0,"failed backup cannot download partial content");
  check(await page.evaluate(()=>window.readinessQa.calls.some(call=>call.table==="export_jobs")),false,"failed backup is not audited as complete");
  check(errors,[],"no uncaught browser errors");
  console.log(`PASS: ${checks} Auth/save/export browser checks; synthetic users only.`);
} finally {if(browser)await browser.close();await rm(directory,{recursive:true,force:true});}
