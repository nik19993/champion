"use client";
import { useState } from "react";
import { prepareTrainingDocument } from "@/lib/browser/prepare-training-document";
export default function CompressionCheck() {
  const [result,setResult]=useState("ready");
  return <main><input aria-label="Synthetic file" type="file" onChange={async e=>{
    const file=e.target.files?.[0]; if(!file)return;
    setResult("working");
    try{ const prepared=await prepareTrainingDocument(file); (globalThis as unknown as {preparedFile: File}).preparedFile=prepared.file; setResult(JSON.stringify({name:prepared.file.name,before:file.size,after:prepared.file.size,note:prepared.note,attempted:prepared.attempted})); }
    catch(error){setResult(JSON.stringify({error:error instanceof Error?error.message:"error"}));}
  }}/><output>{result}</output></main>;
}
