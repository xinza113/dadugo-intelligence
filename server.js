require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const required = ["JWT_SECRET","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"];
for (const k of required) if (!process.env[k]) console.warn(`PERINGATAN: ${k} belum diatur.`);
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({limit:"100kb"}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname,"public")));
app.use("/api", rateLimit({windowMs:60_000, limit:120, standardHeaders:true, legacyHeaders:false}));
const db = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;
const failDb = (res) => res.status(503).json({error:"Database belum dikonfigurasi."});
const asyncRoute = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);

function auth(req,res,next) {
  const token = req.cookies.session;
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({error:"Silakan login kembali."}); }
}
function admin(req,res,next) {
  if (req.user?.role !== "admin") return res.status(403).json({error:"Khusus admin."});
  next();
}
function signIn(res,user) {
  const token = jwt.sign({id:user.id,username:user.username,role:user.role},process.env.JWT_SECRET,{expiresIn:"7d"});
  res.cookie("session",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*864e5});
}
async function insertActivity(userId, action, detail={}) {
  if (db) await db.from("activity_logs").insert({user_id:userId,action,detail});
}

app.post("/api/register", asyncRoute(async(req,res)=>{
  if(!db) return failDb(res);
  const {username,password}=req.body||{};
  if(typeof username!=="string" || !/^[a-zA-Z0-9_]{3,20}$/.test(username) ||
     typeof password!=="string" || password.length<8 || password.length>100)
    return res.status(400).json({error:"Username 3–20 karakter; password minimal 8 karakter."});
  const hash=await bcrypt.hash(password,12);
  const {data,error}=await db.from("users").insert({username,password_hash:hash,points:1000,role:"user"}).select("id,username,role,points").single();
  if(error) return res.status(409).json({error:"Username mungkin sudah digunakan."});
  signIn(res,data); await insertActivity(data.id,"register");
  res.json({user:data});
}));
app.post("/api/login", asyncRoute(async(req,res)=>{
  if(!db) return failDb(res);
  const {username,password}=req.body||{};
  const {data,error}=await db.from("users").select("*").eq("username",username).maybeSingle();
  if(error || !data || !await bcrypt.compare(password||"",data.password_hash))
    return res.status(401).json({error:"Username atau password salah."});
  signIn(res,data); await insertActivity(data.id,"login");
  res.json({user:{id:data.id,username:data.username,role:data.role,points:data.points}});
}));
app.post("/api/logout",(req,res)=>{res.clearCookie("session");res.json({ok:true});});
app.get("/api/me",auth,asyncRoute(async(req,res)=>{
  const {data,error}=await db.from("users").select("id,username,role,points,created_at").eq("id",req.user.id).single();
  if(error) return res.status(404).json({error:"Akun tidak ditemukan."});
  res.json({user:data});
}));
app.get("/api/dashboard",auth,asyncRoute(async(req,res)=>{
  if(!db) return failDb(res);
  const [{count:users},{count:rounds},{data:recent},{data:all},{data:activity}] = await Promise.all([
    db.from("users").select("*",{count:"exact",head:true}),
    db.from("rounds").select("*",{count:"exact",head:true}),
    db.from("rounds").select("*").order("created_at",{ascending:false}).limit(10),
    db.from("rounds").select("classification"),
    db.from("activity_logs").select("action,created_at").order("created_at",{ascending:false}).limit(8)
  ]);
  const total=all?.length||0, big=all?.filter(x=>x.classification==="B").length||0;
  res.json({users:users||0,rounds:rounds||0,last:recent?.[0]||null,recent:recent||[],activity:activity||[],
    stats:{small:total-big,big,total,smallPct:total?Math.round((total-big)/total*100):0,bigPct:total?Math.round(big/total*100):0}});
}));
app.get("/api/rounds",auth,asyncRoute(async(req,res)=>{
  const limit=Math.min(100,Math.max(1,Number(req.query.limit)||30));
  const {data,error}=await db.from("rounds").select("*").order("created_at",{ascending:false}).limit(limit);
  if(error) throw error; res.json({rounds:data});
}));
app.post("/api/points/daily",auth,asyncRoute(async(req,res)=>{
  const today=new Date().toISOString().slice(0,10);
  const {data:existing}=await db.from("daily_bonuses").select("id").eq("user_id",req.user.id).eq("bonus_date",today).maybeSingle();
  if(existing) return res.status(409).json({error:"Bonus harian sudah diklaim."});
  const {data:user}=await db.from("users").select("points").eq("id",req.user.id).single();
  const {error:e1}=await db.from("daily_bonuses").insert({user_id:req.user.id,bonus_date:today});
  if(e1) return res.status(409).json({error:"Bonus harian sudah diklaim."});
  const {data,error}=await db.from("users").update({points:user.points+100}).eq("id",req.user.id).select("points").single();
  if(error) throw error;
  await db.from("point_transactions").insert({user_id:req.user.id,amount:100,reason:"Bonus harian"});
  res.json({points:data.points,bonus:100});
}));
app.get("/api/leaderboard",auth,asyncRoute(async(req,res)=>{
  const {data,error}=await db.from("users").select("username,points").order("points",{ascending:false}).limit(10);
  if(error) throw error; res.json({leaderboard:data});
}));

// Webhook: secret token diverifikasi; hanya chat yang diizinkan diproses.
app.post("/telegram/webhook",asyncRoute(async(req,res)=>{
  const secret=req.get("X-Telegram-Bot-Api-Secret-Token");
  if(!process.env.TELEGRAM_WEBHOOK_SECRET || secret!==process.env.TELEGRAM_WEBHOOK_SECRET)
    return res.sendStatus(401);
  const update=req.body;
  const msg=update.message;
  if(!msg || String(msg.chat?.id)!==String(process.env.TELEGRAM_CHAT_ID)) return res.sendStatus(200);
  const dice=msg.dice;
  if(!dice || dice.emoji!=="🎲") return res.sendStatus(200);
  // Satu pesan 🎲 menghasilkan satu nilai; tiga roll berurutan dikirim admin sebagai tiga pesan.
  const {data,error}=await db.from("telegram_dice_events").insert({
    chat_id:String(msg.chat.id),message_id:msg.message_id,value:dice.value,
    user_label:msg.from?.username||msg.from?.first_name||"Telegram"
  }).select("id").single();
  if(error) throw error;
  // Buat ronde otomatis setiap tiga event terbaru yang belum dipakai.
  const {data:events}=await db.from("telegram_dice_events").select("*").is("round_id",null)
    .eq("chat_id",String(msg.chat.id)).order("created_at",{ascending:true}).limit(3);
  if(events?.length===3){
    const values=events.map(e=>e.value), total=values.reduce((a,b)=>a+b,0);
    const round={m1:values[0],m2:values[1],m3:values[2],total,classification:total<=10?"K":"B",
      telegram_message_ids:events.map(e=>e.message_id)};
    const {data:r,error:re}=await db.from("rounds").insert(round).select().single();
    if(re) throw re;
    await db.from("telegram_dice_events").update({round_id:r.id}).in("id",events.map(e=>e.id));
  }
  res.sendStatus(200);
}));

// Admin endpoints
app.get("/api/admin/users",auth,admin,asyncRoute(async(req,res)=>{
  const {data,error}=await db.from("users").select("id,username,role,points,created_at").order("created_at",{ascending:false}).limit(200);
  if(error) throw error; res.json({users:data});
}));
app.post("/api/admin/points",auth,admin,asyncRoute(async(req,res)=>{
  const {userId,points}=req.body||{};
  if(!Number.isInteger(points)||points<0||points>100000000) return res.status(400).json({error:"Jumlah poin tidak valid."});
  const {data,error}=await db.from("users").update({points}).eq("id",userId).select("id,username,points").single();
  if(error) throw error;
  await db.from("point_transactions").insert({user_id:userId,amount:points,reason:"Penyesuaian admin"});
  await insertActivity(req.user.id,"admin_set_points",{userId,points});
  res.json({user:data});
}));
app.post("/api/admin/announcement",auth,admin,asyncRoute(async(req,res)=>{
  const message=String(req.body?.message||"").trim();
  if(!message||message.length>500) return res.status(400).json({error:"Pengumuman harus 1–500 karakter."});
  const {error}=await db.from("announcements").insert({message,created_by:req.user.id});
  if(error) throw error; await insertActivity(req.user.id,"announcement",{message}); res.json({ok:true});
}));
app.use((err,req,res,next)=>{
  console.error("API_ERROR",err);
  res.status(500).json({error:"Terjadi kesalahan server. Periksa log server."});
});
const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`DADUGO INTELLIGENCE aktif di port ${port}`));
