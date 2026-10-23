// Browser-only test transport. Executes the SAME PostgreSQL RPCs/RLS locally.
// No URL, API key, network client, real user or real club data exists here.
const identifier=value=>{if(!/^[a-z_][a-z0-9_]*$/.test(value))throw new Error("Invalid test identifier");return `"${value}"`;};
const plain=value=>JSON.parse(JSON.stringify(value));
export function createReviewTransport(db) {
  let tail=Promise.resolve();
  function run(profile,operation) {
    const result=tail.then(async()=>{
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:profile.id,aal:profile.role==="admin"?"aal2":"aal1"})]);
      await db.exec("set role authenticated");
      return operation();
    });tail=result.catch(()=>undefined);return result;
  }
  return profile=>{
    class Query {
      constructor(table){this.table=identifier(table);this.name=table;this.filters=[];this.values=[];this.orders=[];}
      select(fields="*",options={}){this.fields=fields;this.options=options;this.returning=true;return this;}
      filter(key,operator,value){this.values.push(value);this.filters.push(`${identifier(key)} ${operator} $${this.values.length}`);return this;}
      eq(key,value){return this.filter(key,"=",value);}
      neq(key,value){return this.filter(key,"<>",value);}
      gte(key,value){return this.filter(key,">=",value);}
      gt(key,value){return this.filter(key,">",value);}
      lt(key,value){return this.filter(key,"<",value);}
      lte(key,value){return this.filter(key,"<=",value);}
      in(key,value){this.values.push(value);this.filters.push(`${identifier(key)}=any($${this.values.length})`);return this;}
      is(key,value){if(value!==null)throw Error("Unsupported test predicate");this.filters.push(`${identifier(key)} is null`);return this;}
      order(key,options={}){this.orders.push(`${identifier(key)} ${options.ascending===false?"desc":"asc"}`);return this;}
      range(start,end){this.start=start;this.limitSize=end-start+1;return this;}
      limit(size){this.limitSize=size;return this;}
      single(){this.one=true;return this;}
      maybeSingle(){this.one=true;this.optional=true;return this;}
      insert(payload){this.operation="insert";this.payload=payload;return this;}
      upsert(payload,options){this.operation="insert";this.payload=payload;this.conflict=options?.onConflict;return this;}
      update(payload){this.operation="update";this.payload=payload;return this;}
      delete(){this.operation="delete";return this;}
      async execute(){
        const where=this.filters.length?` where ${this.filters.join(" and ")}`:"";
        let rows=[],count=null;
        if(this.operation==="insert"){
          const payload=Array.isArray(this.payload)?this.payload:[this.payload];
          // A single SQL statement preserves PostgREST's all-or-nothing insert.
          if(payload.length){
            const fields=[...new Set(payload.flatMap(Object.keys))],values=[];
            const tuples=payload.map(row=>`(${fields.map(key=>{values.push(row[key]??null);return `$${values.length}`;}).join(",")})`);
            const conflict=this.conflict?` on conflict (${this.conflict.split(",").map(identifier).join(",")}) do update set ${fields.filter(key=>key!=="id").map(key=>`${identifier(key)}=excluded.${identifier(key)}`).join(",")}`:"";
            rows=(await db.query(`insert into public.${this.table} (${fields.map(identifier).join(",")}) values ${tuples.join(",")}${conflict}${this.returning?" returning *":""}`,values)).rows;
          }
        } else if(this.operation==="update"){
          const keys=Object.keys(this.payload),values=[...this.values,...keys.map(key=>this.payload[key])];
          rows=(await db.query(`update public.${this.table} set ${keys.map((key,index)=>`${identifier(key)}=$${this.values.length+index+1}`).join(",")}${where}${this.returning?" returning *":""}`,values)).rows;
        } else if(this.operation==="delete"){
          rows=(await db.query(`delete from public.${this.table}${where}${this.returning?" returning *":""}`,this.values)).rows;
        } else {
          if(this.options?.count)count=Number((await db.query(`select count(*)::int as count from public.${this.table}${where}`,this.values)).rows[0].count);
          if(!this.options?.head){
            const limit=this.limitSize==null?"":` limit ${Number(this.limitSize)}`,offset=this.start==null?"":` offset ${Number(this.start)}`;
            rows=(await db.query(`select to_jsonb(t) as row from public.${this.table} t${where}${this.orders.length?` order by ${this.orders.join(",")}`:""}${limit}${offset}`,this.values)).rows.map(item=>item.row);
            if(this.name==="attendance_sessions" && this.fields?.includes("attendance_records")){
              for(const session of rows)session.attendance_records=(await db.query("select r.*,jsonb_build_object('id',p.id,'full_name',p.full_name) as players from attendance_records r join players p on p.id=r.player_id where r.session_id=$1",[session.id])).rows;
            }
          }
        }
        if(this.options?.head)return {data:null,error:null,count};
        if(this.one && rows.length!==1 && !this.optional)return {data:null,error:{code:"PGRST116",message:"Запис не підтверджено"},count};
        return {data:plain(this.one?rows[0]??null:rows),error:null,count};
      }
      then(resolve,reject){return run(profile,()=>this.execute()).catch(error=>({data:null,error:{code:error.code,message:error.message},count:null})).then(resolve,reject);}
    }
    return {
      from:table=>new Query(table),
      rpc:async(name,args={})=>run(profile,async()=>{
        const entries=Object.entries(args),sql=`select public.${identifier(name)}(${entries.map(([key],index)=>`${identifier(key)}=>$${index+1}`).join(",")}) as value`;
        return {data:plain((await db.query(sql,entries.map(([,value])=>value))).rows[0]?.value??null),error:null};
      }).catch(error=>({data:null,error:{code:error.code,message:error.message}})),
      // These only identify the synthetic local role; there is no Auth service.
      auth:{getSession:async()=>({data:{session:{user:{id:profile.id}}},error:null}),getUser:async()=>({data:{user:{id:profile.id}},error:null}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:profile.role==="admin"?"aal2":"aal1"},error:null})}},
      functions:{invoke:async()=>({data:null,error:{message:"У цій контрольній версії використайте CSV. Перевірка Word/Excel через Supabase потребує окремого тестового сервера."}})},
      storage:{from:()=>({upload:async()=>({data:null,error:new Error("Для цієї локальної перевірки використайте CSV.")}),remove:async()=>({error:null})})},
    };
  };
}
