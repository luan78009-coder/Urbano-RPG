const express = require("express");
const session = require("express-session");
const multer = require("multer");

const app = express();
app.set("trust proxy", 1);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "troque-esta-senha";
const SESSION_SECRET = process.env.SESSION_SECRET || "troque-este-secret";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 1000 * 60 * 60 * 8 }
}));

const page = (title, body, extra="") => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Urbano RPG</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#070a09;color:#e9fff2;font-family:Arial,sans-serif}
nav{padding:18px 6%;border-bottom:1px solid #173524;display:flex;justify-content:space-between;align-items:center}
.logo{font-size:24px;font-weight:900;color:#50ff87}.logo span{color:#fff}a{color:#7dffa5;text-decoration:none;margin-left:18px}
main{max-width:1000px;margin:45px auto;padding:0 20px}.hero{padding:45px 25px;border:1px solid #17452a;border-radius:22px;background:linear-gradient(145deg,#0b160f,#070a09)}
h1{font-size:46px;margin:0 0 12px}h2{color:#72ff9a}p{color:#b9c8bf;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:25px}.card{border:1px solid #193d28;border-radius:16px;padding:22px;background:#0b110d}
.btn{display:inline-block;border:0;border-radius:10px;padding:13px 18px;background:#37e879;color:#041008;font-weight:800;cursor:pointer;margin-top:10px}
input,select,textarea{width:100%;padding:13px;margin:7px 0 15px;border-radius:10px;border:1px solid #284a35;background:#0a100c;color:#fff}label{font-weight:700}
.ok{padding:14px;border:1px solid #2c8f4c;background:#0b2112;border-radius:10px;margin:15px 0}.err{padding:14px;border:1px solid #a33;background:#210b0b;border-radius:10px}
small{color:#8fa399}
</style>${extra}</head><body>
<nav><div class="logo">URBANO <span>RPG</span></div><div><a href="/">Início</a><a href="/denuncias">Denúncias</a><a href="/login">Admin</a></div></nav>
${body}</body></html>`;

function makeProtocol(){ return "URB-" + Date.now().toString(36).toUpperCase() + "-" + Math.floor(100+Math.random()*900); }
function requireAdmin(req,res,next){ if(!req.session.admin) return res.status(401).json({error:"Não autorizado"}); next(); }

async function supabase(path, options={}) {
  if(!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase não configurado no Render.");
  const r = await fetch(SUPABASE_URL + path, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type":"application/json", ...(options.headers||{}) }
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if(!r.ok) throw new Error(typeof data === "object" ? JSON.stringify(data) : String(data));
  return data;
}

app.get("/", (req,res)=>res.send(page("Início", `<main><section class="hero">
<h1>Urbano RPG</h1><p>Portal oficial do servidor. Faça denúncias, acompanhe a comunidade e envie sugestões.</p>
<a class="btn" href="/denuncias">Fazer denúncia</a></section>
<div class="grid"><div class="card"><h2>🚨 Denúncias</h2><p>Envie ocorrências com protocolo para análise da administração.</p></div>
<div class="card"><h2>💡 Sugestões</h2><p>Espaço preparado para receber ideias da comunidade.</p></div>
<div class="card"><h2>🛒 Loja</h2><p>Área reservada para futuras compras e benefícios.</p></div>
<div class="card"><h2>📜 Regras</h2><p>Consulte as regras oficiais do servidor.</p></div></div></main>`)));

app.get("/denuncias",(req,res)=>res.send(page("Denúncia", `<main><div class="hero"><h1>Nova denúncia</h1>
<form method="post" action="/api/denuncias" enctype="multipart/form-data">
<label>Seu nick / nome</label><input name="denunciante_nome" required>
<label>Seu ID (opcional)</label><input name="denunciante_id">
<label>Player denunciado</label><input name="acusado_nome" required>
<label>Categoria</label><select name="categoria" required><option value="">Selecione</option><option>RDM</option><option>VDM</option><option>Anti-RP</option><option>Desrespeito</option><option>Hack/Cheat</option><option>Outra</option></select>
<label>Quando aconteceu?</label><input name="ocorrido_em" type="datetime-local">
<label>Descrição</label><textarea name="descricao" rows="7" required></textarea>
<label>Prova (até 10 MB)</label><input name="prova" type="file" accept="image/*,video/*,.pdf">
<button class="btn" type="submit">Enviar denúncia</button>
</form></div></main>`)));

app.post("/api/denuncias", upload.single("prova"), async (req,res)=>{
  try {
    const protocolo = makeProtocol();
    let prova_url = null;
    // O formulário aceita a prova e mantém a estrutura pronta para Storage.
    // A URL fica nula até configurarmos o bucket de provas.
    await supabase("/rest/v1/denuncias", {method:"POST", headers:{"Prefer":"return=minimal"}, body:JSON.stringify({
      protocolo, denunciante_nome:req.body.denunciante_nome, denunciante_id:req.body.denunciante_id||null,
      acusado_nome:req.body.acusado_nome, categoria:req.body.categoria, ocorrido_em:req.body.ocorrido_em||null,
      descricao:req.body.descricao, prova_url
    })});
    res.send(page("Denúncia enviada", `<main><div class="hero"><div class="ok"><h2>Denúncia enviada!</h2><p>Seu protocolo é:</p><h1>${protocolo}</h1><p>Guarde esse número para futuras consultas.</p></div><a class="btn" href="/">Voltar ao início</a></div></main>`));
  } catch(e) { res.status(500).send(page("Erro", `<main><div class="err"><h2>Não foi possível enviar.</h2><p>${String(e.message).replaceAll("<","&lt;")}</p></div></main>`)); }
});

app.get("/login",(req,res)=>res.send(page("Admin", `<main><div class="hero"><h1>Painel administrativo</h1>
<form method="post" action="/api/login"><label>Usuário</label><input name="user" required><label>Senha</label><input name="password" type="password" required><button class="btn">Entrar</button></form></div></main>`)));

app.post("/api/login",(req,res)=>{ if(req.body.user===ADMIN_USER && req.body.password===ADMIN_PASSWORD){req.session.admin=true;return res.redirect("/admin")} res.status(401).send(page("Acesso negado",`<main><div class="err"><h2>Usuário ou senha incorretos.</h2><a href="/login">Voltar</a></div></main>`)); });

app.get("/admin",(req,res)=>{
  if(!req.session.admin) return res.redirect("/login");
  res.send(page("Painel", `<main><div class="hero"><h1>Painel Urbano RPG</h1><p>Área administrativa das denúncias.</p><button class="btn" onclick="load()">Atualizar denúncias</button><div id="list" class="grid"></div></div></main>
<script>
async function load(){let r=await fetch('/api/denuncias');let d=await r.json();document.querySelector('#list').innerHTML=d.map(x=>'<div class="card"><h2>'+x.protocolo+'</h2><p><b>Acusado:</b> '+x.acusado_nome+'</p><p><b>Categoria:</b> '+x.categoria+'</p><p><b>Status:</b> '+x.status+'</p><p>'+x.descricao+'</p></div>').join('')||'<p>Nenhuma denúncia.</p>'} load();
</script>`));
});

app.get("/api/denuncias", requireAdmin, async (req,res)=>{
  try { const d=await supabase("/rest/v1/denuncias?select=*&order=created_at.desc"); res.json(d); }
  catch(e){res.status(500).json({error:e.message});}
});

app.listen(PORT,()=>console.log("Urbano RPG rodando na porta "+PORT));
