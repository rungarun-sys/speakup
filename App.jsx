import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, Compass, Award, User, Settings, LogOut, 
  Mic, Send, Play, FastForward, 
  Star, TrendingUp, BookOpen, Users,
  BarChart, Shield, Zap, Sparkles
} from 'lucide-react';

// --- API CONFIGURATION ---
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby7n--m0Z-n-Bu7YnkCk2KODWpg4d0cT5pvy8ZoxtcLmwZvpqqRJw-jpd61I2B7Ny2LhQ/exec";

// --- GEMINI API HELPER ---
async function callGemini(contents, systemInstructionText) {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, systemInstructionText })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini proxy error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.text || "";
}

// --- MOCK DATABASE & CONSTANTS ---
const VOCAB_DB = {
  reservation: { thai: "การจอง", guide: "rez-er-VAY-shun", example: "I have a hotel reservation." },
  recommend: { thai: "แนะนำ", guide: "rek-uh-MEND", example: "Can you recommend a good place?" },
  receipt: { thai: "ใบเสร็จ", guide: "ri-SEET", example: "May I have the receipt, please?" },
  delayed: { thai: "ล่าช้า", guide: "dee-LAYD", example: "My flight is delayed." },
  symptoms: { thai: "อาการ", guide: "SIMP-tums", example: "What are your symptoms?" },
  interview: { thai: "สัมภาษณ์", guide: "IN-ter-vyoo", example: "I have a job interview today." },
  budget: { thai: "งบประมาณ", guide: "BUJ-it", example: "It is out of my budget." },
  boarding: { thai: "การขึ้นเครื่อง", guide: "BORD-ing", example: "Where is the boarding gate?" },
  appointment: { thai: "การนัดหมาย", guide: "uh-POINT-munt", example: "I have an appointment at 3 PM." }
};

const SITUATIONS = [
  {
    category: "Daily Life",
    items: [
      { id: 's1', title: "Ordering Coffee", diff: "Easy", xp: 50, icon: "☕", initialAI: "Welcome to Star Beans! What can I get for you today?", category: "Daily Life" },
      { id: 's2', title: "Restaurant", diff: "Medium", xp: 75, icon: "🍽️", initialAI: "Good evening. Do you have a reservation with us?", category: "Daily Life" },
      { id: 's3', title: "Shopping Mall", diff: "Easy", xp: 50, icon: "🛍️", initialAI: "Hi there! Let me know if you need help finding anything or if you have a budget.", category: "Daily Life" }
    ]
  },
  {
    category: "Travel & Transport",
    items: [
      { id: 's4', title: "Airport Check-in", diff: "Medium", xp: 75, icon: "✈️", initialAI: "Hello. Passport and booking reference, please. Are you checking any bags?", category: "Travel & Transport" },
      { id: 's5', title: "Lost Luggage", diff: "Hard", xp: 100, icon: "🧳", initialAI: "I'm sorry to hear that. Can you describe your luggage and show me your boarding pass?", category: "Travel & Transport" },
      { id: 's6', title: "Asking Directions", diff: "Easy", xp: 50, icon: "🗺️", initialAI: "Excuse me, are you lost? Where are you trying to go?", category: "Travel & Transport" }
    ]
  },
  {
    category: "Professional & Work",
    items: [
      { id: 's7', title: "Job Interview", diff: "Hard", xp: 120, icon: "💼", initialAI: "Good morning! Please take a seat. Tell me a little bit about yourself.", category: "Professional & Work" },
      { id: 's8', title: "Office Meeting", diff: "Hard", xp: 100, icon: "📊", initialAI: "Let's start the meeting. Could you give us an update on your project?", category: "Professional & Work" }
    ]
  },
  {
    category: "Emergency",
    items: [
      { id: 's9', title: "At the Hospital", diff: "Medium", xp: 80, icon: "🏥", initialAI: "Hello. Please sit down. What are your symptoms today? Do you have an appointment?", category: "Emergency" }
    ]
  }
];

const GUEST_DEMO_USER = {
  id: "GUEST001",
  name: "Guest Student",
  role: "student",
  avatar: "🤖",
  class: "Demo Class",
  classroomId: "DEMO",
  xp: 250,
  level: 3,
  streak: 5,
  goal: "Practice English speaking with AI",
  stats: {
    pronunciation: 82,
    fluency: 76,
    vocab: 70
  },
  progress: {
    conversations: 3,
    turns: 3,
    situations: ["s1", "s2"],
    categories: ["Daily Life"],
    lastPracticeAt: new Date().toISOString()
  },
  isGuest: true
};

const GUEST_AI_LIMIT = 5;
const GUEST_AI_COOLDOWN_MS = 3500;

const normalizeStats = (stats = {}) => ({
  pronunciation: Math.max(0, Math.min(100, Math.round(Number(stats.pronunciation ?? stats.pronunciationScore ?? 0) || 0))),
  fluency: Math.max(0, Math.min(100, Math.round(Number(stats.fluency ?? stats.fluencyScore ?? 0) || 0))),
  vocab: Math.max(0, Math.min(100, Math.round(Number(stats.vocab ?? stats.vocabulary ?? stats.vocabScore ?? 0) || 0)))
});

const normalizeUserData = (userData) => {
  if (!userData) return userData;
  const stats = normalizeStats({
    ...(userData.stats || {}),
    pronunciation: userData.stats?.pronunciation ?? userData.pronunciation,
    fluency: userData.stats?.fluency ?? userData.fluency,
    vocab: userData.stats?.vocab ?? userData.vocab ?? userData.vocabulary
  });

  return {
    ...userData,
    stats,
    progress: userData.progress || {},
    ttsVoiceKey: userData.ttsVoiceKey || userData.voiceKey || ''
  };
};

const getVoiceKey = (voice) => {
  if (!voice) return '';
  return voice.voiceURI || `${voice.name}-${voice.lang}`;
};

const getVoiceLabel = (voice) => {
  if (!voice) return 'Auto English Voice';
  return `${voice.name} (${voice.lang || 'English'})`;
};

const rankEnglishVoice = (voice) => {
  const name = (voice?.name || '').toLowerCase();
  const lang = (voice?.lang || '').toLowerCase();
  const isEnglish = lang.startsWith('en') || name.includes('english');
  const isUsEnglish = lang === 'en-us' || name.includes('united states') || name.includes('us english');

  if (!isEnglish) return 0;
  if (name.includes('google') && isUsEnglish) return 100;
  if (name.includes('microsoft')) return 90;
  if (name.includes('siri')) return 80;
  if (isUsEnglish) return 70;
  return 50;
};

const pickBestEnglishVoice = (voices, preferredVoiceKey = '') => {
  const englishVoices = (voices || []).filter(voice => rankEnglishVoice(voice) > 0);
  const preferredVoice = englishVoices.find(voice => getVoiceKey(voice) === preferredVoiceKey);
  if (preferredVoice) return preferredVoice;

  return [...englishVoices].sort((a, b) => rankEnglishVoice(b) - rankEnglishVoice(a))[0] || null;
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('auth');
  const [activeSituation, setActiveSituation] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceKey, setSelectedVoiceKey] = useState('');

  // 🟢 ฟังก์ชันหลักสำหรับอัปเดตข้อมูลผู้ใช้และ Sync ขึ้น Google Sheets อัตโนมัติ 
  const handleUpdateUser = (updater) => {
    setUser(prev => {
      if (!prev) return prev;
      
      // 1. คำนวณข้อมูลผู้ใช้ใหม่ (รองรับทั้งแบบส่งเป็นค่า หรือ ส่งเป็น Function)
      const newUser = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      
      // 2. บันทึกสำรองลงเครื่อง (Session Persistence & Fast cache)
      if (!newUser.isGuest) {
        localStorage.setItem(`speakup_user_cache_${newUser.id}`, JSON.stringify(newUser));
      }
      
      // 3. ทริกเกอร์การ Sync ขึ้น Backend (Google Sheets)
      syncToBackend(newUser);
      
      return newUser;
    });
  };

  // 🟢 ระบบ Backend Syncing พร้อม Retry เมื่อเน็ตหลุด 
  const syncToBackend = async (userData) => {
    if (userData.role !== 'student') return;
    if (userData.isGuest) return;
    const stats = normalizeStats(userData.stats);
    const progress = userData.progress || {};

    const payload = {
      studentId: userData.id,
      name: userData.name,
      avatar: userData.avatar,
      goal: userData.goal,
      level: userData.level,
      xp: userData.xp,
      streak: userData.streak,
      stats,
      pronunciation: stats.pronunciation,
      fluency: stats.fluency,
      vocab: stats.vocab,
      vocabulary: stats.vocab,
      pronunciationScore: stats.pronunciation,
      fluencyScore: stats.fluency,
      vocabScore: stats.vocab,
      statsJson: JSON.stringify(stats),
      progress,
      progressJson: JSON.stringify(progress),
      lastPracticeAt: progress.lastPracticeAt || new Date().toISOString(),
      ttsVoiceKey: userData.ttsVoiceKey || '',
      voiceKey: userData.ttsVoiceKey || '',
      voiceName: userData.ttsVoiceName || ''
    };
    
    // ตั้งค่าเวลาหน่วงในการลองใหม่ (Exponential Backoff)
    let delays = [1000, 2000, 4000];
    
    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'sync_student_data',
            payload: payload
          })
        });
        if (response.ok) return; // ทำสำเร็จ ออกจากลูป
      } catch (error) {
        if (i === 2) console.error("ไม่สามารถ Sync ไปยัง Google Sheets ได้ (ลองครบ 3 ครั้งแล้ว):", error);
        await new Promise(r => setTimeout(r, delays[i])); // รอแล้วลองใหม่
      }
    }
  };

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    const warmupTimer = window.setTimeout(loadVoices, 500);
    return () => {
      window.clearTimeout(warmupTimer);
      if (window.speechSynthesis.onvoiceschanged === loadVoices) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const cachedVoiceKey = localStorage.getItem(`speakup_voice_${user.id}`) || '';
    const nextVoiceKey = user.ttsVoiceKey || cachedVoiceKey;
    if (nextVoiceKey) setSelectedVoiceKey(nextVoiceKey);
  }, [user?.id, user?.ttsVoiceKey]);

  const handleVoicePreferenceChange = (voiceKey) => {
    setSelectedVoiceKey(voiceKey);

    if (user?.id) {
      localStorage.setItem(`speakup_voice_${user.id}`, voiceKey);
      const selectedVoice = availableVoices.find(voice => getVoiceKey(voice) === voiceKey);
      handleUpdateUser({
        ttsVoiceKey: voiceKey,
        ttsVoiceName: selectedVoice?.name || ''
      });
    }
  };

  useEffect(() => {
    if (user && view === 'auth') {
      setView(user.role === 'teacher' ? 'teacher' : 'home');
    }
  }, [user, view]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans sm:pb-0 pb-16">
      {view === 'auth' && <AuthScreen onLogin={setUser} />}
      {view === 'home' && <HomeView setView={setView} user={user} />}
      {view === 'practice' && <PracticeView setView={setView} onSelectSituation={(s) => { setActiveSituation(s); setView('chat'); }} />}
      {view === 'chat' && <ChatView situation={activeSituation} setView={setView} user={user} updateUser={handleUpdateUser} availableVoices={availableVoices} selectedVoiceKey={selectedVoiceKey} />}
      {view === 'progress' && <ProgressView user={user} />}
      {view === 'profile' && <ProfileView user={user} updateUser={handleUpdateUser} availableVoices={availableVoices} selectedVoiceKey={selectedVoiceKey} onVoiceChange={handleVoicePreferenceChange} onLogout={() => { setUser(null); setView('auth'); }} />}
      {view === 'teacher' && <TeacherDashboard user={user} setView={setView} onLogout={() => { setUser(null); setView('auth'); }} />}

      {user && user.role === 'student' && view !== 'chat' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around sm:justify-center sm:gap-16 p-3 pb-safe z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <NavItem icon={<Home />} label="Home" active={view === 'home'} onClick={() => setView('home')} />
          <NavItem icon={<Compass />} label="Practice" active={view === 'practice'} onClick={() => setView('practice')} />
          <NavItem icon={<Award />} label="Progress" active={view === 'progress'} onClick={() => setView('progress')} />
          <NavItem icon={<User />} label="Profile" active={view === 'profile'} onClick={() => setView('profile')} />
        </div>
      )}
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center p-1 transition-colors ${active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
      <div className={`${active ? 'scale-110 mb-1' : 'mb-1'} transition-transform`}>
        {React.cloneElement(icon, { size: active ? 24 : 22, strokeWidth: active ? 2.5 : 2 })}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

// 1. AUTHENTICATION
function AuthScreen({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState('student');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGuestDemo = () => {
    onLogin(normalizeUserData({ ...GUEST_DEMO_USER, progress: { ...GUEST_DEMO_USER.progress } }));
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!username || !password) return alert("กรุณากรอกรหัสผู้ใช้และรหัสผ่าน");
    
    setIsLoading(true);
    let backendSuccess = false;
    let backendData = null;
    let authError = null;

    // 🟢 กำหนด Action และ Payload ให้แยกกันชัดเจนระหว่างครูกับนักเรียน
    const actionName = role === 'teacher' ? 'login_teacher' : 'login_student';
    const payloadData = role === 'teacher' 
      ? { teacherId: username, password: password } 
      : { studentId: username, password: password };

    // 1. ดึงข้อมูลจาก Google Sheets เสมอ (Source of Truth)
    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: actionName,
            payload: payloadData
          })
        });
        
        const result = await response.json();
        if (result.success) {
          backendSuccess = true;
          backendData = result.user;
          break; // สำเร็จแล้ว ให้ออกจาก Loop Retry ทันที
        } else {
          authError = result.error || "รหัสผ่านไม่ถูกต้อง";
          break; // รหัสผิด ไม่ต้อง Retry
        }
      } catch (error) {
        if (i < 2) await new Promise(r => setTimeout(r, 1000 * (i + 1))); // รอ 1 วิ 2 วิ ก่อนลองใหม่
      }
    }

    if (backendSuccess && backendData) {
      // 🟢 ข้อมูลล่าสุดจาก Backend (อัปเดตทับ Cache ทันที)
      const normalizedUser = normalizeUserData(backendData);
      localStorage.setItem(`speakup_user_cache_${username}`, JSON.stringify(normalizedUser));
      onLogin(normalizedUser);
    } else if (authError) {
      alert(`เข้าสู่ระบบไม่สำเร็จ: ${authError}`);
    } else {
      // 2. Offline Fallback: ทำงานก็ต่อเมื่อ Server/เน็ต มีปัญหาจริงๆ (Fetch Error รัวๆ)
      const cachedData = localStorage.getItem(`speakup_user_cache_${username}`);
      if (cachedData) {
        alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กำลังเข้าสู่ระบบด้วยข้อมูลออฟไลน์ล่าสุดในเครื่อง");
        onLogin(normalizeUserData(JSON.parse(cachedData)));
      } else {
        alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ และไม่มีข้อมูลผู้ใช้งานถูกบันทึกไว้ในอุปกรณ์นี้ กรุณาลองใหม่เมื่อมีอินเทอร์เน็ต");
      }
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-white">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 text-white shadow-lg mb-4">
            <Mic size={32} />
          </div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">SpeakUp AI</h1>
          <p className="text-slate-500 mt-2 text-sm">Practice English Anytime, Anywhere.</p>
        </div>

        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
          <button onClick={() => setRole('student')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${role === 'student' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Student</button>
          <button onClick={() => setRole('teacher')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${role === 'teacher' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Teacher</button>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">ID or Email</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all" placeholder={role === 'student' ? 'e.g. STU1001' : 'Teacher ID / Email'} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all" placeholder="••••••••" />
          </div>
          <button type="submit" disabled={isLoading} className="w-full flex justify-center items-center py-3.5 rounded-xl text-white font-medium shadow-md transition-transform active:scale-95 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-70">
            {isLoading ? (
              <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div> กำลังโหลดข้อมูล...</>
            ) : (
              isRegister ? 'Create Account' : 'Log In'
            )}
          </button>
        </form>

        <div className="mt-4">
          <button
            type="button"
            onClick={handleGuestDemo}
            className="w-full flex justify-center items-center gap-2 py-3.5 rounded-xl text-blue-700 font-bold bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors active:scale-95"
          >
            <Sparkles size={18} /> Try Guest Demo
          </button>
          <p className="text-center text-[11px] text-slate-500 mt-2">
            For OBEC Content Center reviewers. No password required.
          </p>
        </div>

        <p className="text-center mt-6 text-sm text-slate-500">
          {isRegister ? 'Already have an account?' : "Don't have an account?"} 
          <button onClick={() => setIsRegister(!isRegister)} className="ml-1 text-blue-600 font-semibold">{isRegister ? 'Log in' : 'Register'}</button>
        </p>
      </div>
    </div>
  );
}

// 2. HOME VIEW
function HomeView({ setView, user }) {
  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      <header className="flex justify-between items-center pt-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-800">Hi, {user?.name}! {user?.avatar}</h2>
            {user?.isGuest && (
              <span className="bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide">
                Guest Demo Mode
              </span>
            )}
          </div>
          <p className="text-slate-500 text-sm">Ready to speak English today?</p>
        </div>
        <div className="bg-orange-100 text-orange-600 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-bold shadow-sm">
          <Zap size={16} fill="currentColor" /> {user?.streak} Days
        </div>
      </header>

      {/* Hero Card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-900/20 relative overflow-hidden">
        <div className="relative z-10 w-2/3">
          <span className="bg-white/20 text-blue-50 text-xs font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider mb-3 inline-block">Daily Mission</span>
          <h3 className="text-xl sm:text-2xl font-bold mb-2">Order food at a restaurant</h3>
          <p className="text-blue-100 text-sm mb-5">Earn +50 XP and practice your pronunciation!</p>
          <button onClick={() => setView('practice')} className="bg-white text-blue-600 px-5 py-2.5 rounded-xl font-bold text-sm shadow-md hover:bg-blue-50 transition-colors">Start Practice</button>
        </div>
        <div className="absolute right-[-20px] bottom-[-20px] text-8xl opacity-80 z-0 drop-shadow-lg">
          🍔
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="bg-blue-100 text-blue-600 p-3 rounded-xl"><Star size={24} /></div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Total XP</p>
            <p className="text-lg font-bold text-slate-800">{user?.xp}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="bg-emerald-100 text-emerald-600 p-3 rounded-xl"><Award size={24} /></div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Current Level</p>
            <p className="text-lg font-bold text-slate-800">Lvl {user?.level}</p>
          </div>
        </div>
      </div>

      {/* Recommended */}
      <div>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><Compass size={20} className="text-indigo-500"/> Recommended for you</h3>
        <div className="grid grid-cols-2 gap-4">
          {SITUATIONS[0].items.slice(0, 2).map(sit => (
             <div key={sit.id} onClick={() => setView('practice')} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 active:scale-95 transition-transform cursor-pointer">
               <div className="text-3xl mb-2">{sit.icon}</div>
               <h4 className="font-semibold text-sm mb-1">{sit.title}</h4>
               <p className="text-xs text-slate-400">{sit.diff} • {sit.xp} XP</p>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 3. PRACTICE (SITUATIONS) VIEW
function PracticeView({ onSelectSituation }) {
  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6 pb-20">
      <header className="pt-4 mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Explore Situations</h2>
        <p className="text-slate-500 text-sm">Choose a real-life scenario to practice.</p>
      </header>

      {SITUATIONS.map((cat, i) => (
        <div key={i} className="mb-6">
          <h3 className="font-bold text-lg mb-3 text-slate-700">{cat.category}</h3>
          <div className="flex flex-col gap-3">
            {cat.items.map(sit => (
              <div key={sit.id} onClick={() => onSelectSituation(sit)} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all active:scale-[0.98]">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-3xl shrink-0">
                  {sit.icon}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-800">{sit.title}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${sit.diff === 'Easy' ? 'bg-green-100 text-green-700' : sit.diff === 'Medium' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                      {sit.diff}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">{sit.xp} XP reward</span>
                  </div>
                </div>
                <div className="text-blue-500">
                  <Play size={24} fill="currentColor" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// 4. AI CHAT INTERFACE
function ChatView({ situation, setView, user, updateUser, availableVoices, selectedVoiceKey }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [micStatus, setMicStatus] = useState('');
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [selectedWord, setSelectedWord] = useState(null);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [usedHelp, setUsedHelp] = useState(false);
  const [guestAiCount, setGuestAiCount] = useState(0);
  const [guestCooldownUntil, setGuestCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastGuestRequestRef = useRef(0);
  const isGuest = Boolean(user?.isGuest);
  const guestMessagesLeft = Math.max(0, GUEST_AI_LIMIT - guestAiCount);
  const guestCooldownRemaining = Math.max(0, guestCooldownUntil - now);
  const isGuestLocked = isGuest && guestMessagesLeft <= 0;
  const isGuestCoolingDown = isGuest && guestCooldownRemaining > 0;

  // Init chat
  useEffect(() => {
    if (situation) {
      setMessages([{ role: 'ai', text: situation.initialAI }]);
      playAudio(situation.initialAI, 1.0);
    }
  }, [situation]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping]);

  useEffect(() => {
    if (!isGuest || !guestCooldownUntil) return;

    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [isGuest, guestCooldownUntil]);

  const toggleRecording = async () => {
    if (isRecording) {
      recognitionRef.current?.stop?.();
      setIsRecording(false);
      return;
    }

    setMicStatus('');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicStatus('This browser does not support speech recognition. Please use Chrome/Edge or type your answer.');
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    
    recognition.onstart = () => {
      setIsRecording(true);
      setMicStatus('Listening...');
    };
    recognition.onerror = (e) => {
      console.error(e);
      setIsRecording(false);
      recognitionRef.current = null;
      const messages = {
        'not-allowed': 'Microphone permission was blocked. Allow microphone access in the browser, then try again.',
        'no-speech': 'No speech detected. Please try again.',
        'audio-capture': 'No microphone was found. Check your input device.',
        'network': 'Speech recognition service is unavailable. Please try again or type your answer.'
      };
      setMicStatus(messages[e.error] || 'Speech recognition failed. Please try again or type your answer.');
    };
    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setMicStatus('Voice captured.');
    };
    
    try {
      recognition.start();
    } catch (error) {
      console.error('Speech recognition start failed:', error);
      recognitionRef.current = null;
      setMicStatus('Speech recognition could not start. Please try again or type your answer.');
    }
  };

  const playAudio = (text, rate = playbackRate) => {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickBestEnglishVoice(availableVoices, user?.ttsVoiceKey || selectedVoiceKey);

    utterance.lang = 'en-US';
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || 'en-US';
    }
    utterance.rate = rate === 1.0 ? 0.92 : Math.max(0.55, Math.min(rate, 1.05));
    utterance.pitch = 1.02;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  };

  const handleSuggestReply = async () => {
    if (isAiTyping || messages.length === 0) return;
    if (isGuestLocked || isGuestCoolingDown) return;
    setIsSuggesting(true);
    setUsedHelp(true); // Flag to reduce XP later

    try {
      const lastAiMessage = [...messages].reverse().find(m => m.role === 'ai')?.text || "";
      const prompt = `The user is an ESL learner practicing English in the scenario: "${situation.title}". The AI just said: "${lastAiMessage}". Provide exactly 1 short, natural response (1-2 sentences max) the user could say next. Return ONLY the English text of the suggestion, without quotes or extra text.`;
      
      const suggestion = await callGemini([{ role: 'user', parts: [{ text: prompt }]}]);
      setInput(suggestion.trim());
    } catch (err) {
      console.error("Suggestion failed", err);
      alert("Failed to get suggestion. Please try again.");
    } finally {
      setIsSuggesting(false);
    }
  };

  const clampScore = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

  const estimateSpeakingScores = (text) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const uniqueWords = new Set(words.map(word => word.toLowerCase().replace(/[^\w']/g, '')));
    const sentenceCount = Math.max(1, text.split(/[.!?]+/).filter(part => part.trim()).length);
    const avgWordsPerSentence = words.length / sentenceCount;
    const longWordCount = words.filter(word => word.replace(/[^\w]/g, '').length >= 7).length;
    const politePhraseBonus = /\b(please|could|would|may|thank you|thanks|excuse me)\b/i.test(text) ? 8 : 0;

    return {
      pronunciation: clampScore(55 + Math.min(25, words.length * 2) + Math.min(12, longWordCount * 3) + politePhraseBonus),
      fluency: clampScore(50 + Math.min(28, avgWordsPerSentence * 3) - (sentenceCount > 3 ? 8 : 0) + politePhraseBonus),
      vocab: clampScore(48 + Math.min(30, uniqueWords.size * 3) + Math.min(14, longWordCount * 4))
    };
  };

  const mergeSpeakingScores = (currentStats = {}, newScores) => {
    const current = {
      pronunciation: clampScore(currentStats.pronunciation),
      fluency: clampScore(currentStats.fluency),
      vocab: clampScore(currentStats.vocab)
    };

    return {
      pronunciation: current.pronunciation ? clampScore(current.pronunciation * 0.65 + newScores.pronunciation * 0.35) : newScores.pronunciation,
      fluency: current.fluency ? clampScore(current.fluency * 0.65 + newScores.fluency * 0.35) : newScores.fluency,
      vocab: current.vocab ? clampScore(current.vocab * 0.65 + newScores.vocab * 0.35) : newScores.vocab
    };
  };

  const savePracticeProgress = (xpReward, speakingScores) => {
    if (user?.isGuest) return;

    const score = Math.round((speakingScores.pronunciation + speakingScores.fluency + speakingScores.vocab) / 3);

    fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: 'save_progress',
        payload: {
          studentId: user?.id,
          situationId: situation?.id,
          turns: messages.length + 1,
          xpEarned: xpReward,
          score,
          pronunciation: speakingScores.pronunciation,
          fluency: speakingScores.fluency,
          vocab: speakingScores.vocab,
          vocabulary: speakingScores.vocab,
          stats: speakingScores,
          statsJson: JSON.stringify(speakingScores)
        }
      })
    }).catch(err => console.error("บันทึกข้อมูลการสนทนาล้มเหลว:", err));
  };

  const parseChatResponse = (responseText) => {
    const cleanText = (responseText || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          reply: parsed.reply || cleanText,
          feedback: parsed.feedback || 'PERFECT'
        };
      } catch (error) {
        console.warn('Gemini returned non-standard JSON, using text fallback:', error);
      }
    }

    return {
      reply: cleanText || "I didn't quite catch that. Could you say it again?",
      feedback: 'PERFECT'
    };
  };

  const getLocalChatFallback = (text) => {
    const lower = text.toLowerCase();
    if (lower.includes('coffee') || lower.includes('latte') || lower.includes('tea')) {
      return "Great choice. What size would you like?";
    }
    if (lower.includes('reservation') || lower.includes('booked')) {
      return "Thank you. I found your reservation. Your table is ready.";
    }
    if (lower.includes('passport') || lower.includes('ticket') || lower.includes('boarding')) {
      return "Thank you. Your flight is on time. Please go to gate B12.";
    }
    if (lower.includes('lost') || lower.includes('luggage') || lower.includes('bag')) {
      return "I understand. Can you describe your bag for me?";
    }
    if (lower.includes('headache') || lower.includes('sick') || lower.includes('symptom')) {
      return "I see. How long have you had these symptoms?";
    }
    if (lower.includes('interview') || lower.includes('job') || lower.includes('work')) {
      return "Nice. What strengths would you bring to this role?";
    }
    if (lower.includes('where') || lower.includes('direction') || lower.includes('go')) {
      return "Sure. Go straight ahead, then turn left at the next corner.";
    }
    return "Good. Can you tell me a little more?";
  };

  const handleSend = async () => {
    if (!input.trim() || isAiTyping) return;
    if (isGuestLocked) return;
    if (isGuestCoolingDown) return;

    if (isGuest) {
      const nowMs = Date.now();
      if (nowMs - lastGuestRequestRef.current < GUEST_AI_COOLDOWN_MS) {
        setGuestCooldownUntil(lastGuestRequestRef.current + GUEST_AI_COOLDOWN_MS);
        return;
      }
      lastGuestRequestRef.current = nowMs;
      setGuestCooldownUntil(nowMs + GUEST_AI_COOLDOWN_MS);
    }
    
    const currentInput = input;
    const newMsg = { role: 'user', text: currentInput };
    
    const geminiHistory = messages.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.text }]
    }));
    geminiHistory.push({ role: 'user', parts: [{ text: currentInput }] });

    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setIsAiTyping(true);

    // 🟢 คำนวณและอัปเดต XP (ระบบจะทำการ Sync ลง Google Sheets อัตโนมัติด้วยฟังก์ชัน updateUser)
    const xpReward = isGuest ? 0 : (usedHelp ? 1 : 5); 
    updateUser(prev => {
      const newXp = prev.xp + xpReward;
      const newLevel = Math.max(prev.level, Math.floor(newXp / 100) + 1);
      const currentProgress = prev.progress || {};
      const practicedSituations = Array.from(new Set([
        ...(currentProgress.situations || []),
        situation?.id
      ].filter(Boolean)));
      const practicedCategories = Array.from(new Set([
        ...(currentProgress.categories || []),
        situation?.category
      ].filter(Boolean)));

      return {
        ...prev,
        xp: newXp,
        level: newLevel,
        progress: prev.isGuest ? currentProgress : {
          ...currentProgress,
          conversations: (currentProgress.conversations || 0) + 1,
          turns: (currentProgress.turns || 0) + 1,
          situations: practicedSituations,
          categories: practicedCategories,
          lastPracticeAt: new Date().toISOString()
        }
      };
    });
    setUsedHelp(false);

    try {
      const systemPrompt = `You are a friendly speaking partner helping a Thai ESL student practice English. You are roleplaying the situation: "${situation.title}" (${situation.category}). Your opening line was: "${situation.initialAI}".

Return ONLY valid JSON in this exact shape:
{
  "reply": "short in-character reply, 1-3 sentences",
  "feedback": "short correction if the learner made a grammar/naturalness mistake, otherwise PERFECT"
}

Rules:
- Be realistic and encouraging.
- Keep reply suitable for conversational speaking practice.
- Do not break character in reply.
- Do not use asterisks for actions.
- feedback must be concise.`;

      const combinedResponse = await callGemini(geminiHistory, systemPrompt);
      const parsed = parseChatResponse(combinedResponse);
      const aiReply = parsed.reply || "I didn't quite catch that. Could you say it again?";
      const feedbackText = parsed.feedback || "PERFECT";
      const finalFeedback = feedbackText.trim().toUpperCase().includes("PERFECT") ? null : feedbackText.trim();
      const speakingScores = estimateSpeakingScores(currentInput);
      savePracticeProgress(xpReward, speakingScores);
      if (isGuest) setGuestAiCount(count => Math.min(GUEST_AI_LIMIT, count + 1));

      if (!isGuest) {
        updateUser(prev => ({
          ...prev,
          stats: mergeSpeakingScores(prev.stats, speakingScores)
        }));
      }

      setMessages(prev => [...prev, { role: 'ai', text: aiReply, feedback: finalFeedback }]);
      playAudio(aiReply, playbackRate);

    } catch (err) {
      console.error("Gemini API Error:", err);
      const fallbackReply = getLocalChatFallback(currentInput);
      const speakingScores = estimateSpeakingScores(currentInput);
      savePracticeProgress(xpReward, speakingScores);
      if (isGuest) setGuestAiCount(count => Math.min(GUEST_AI_LIMIT, count + 1));

      if (!isGuest) {
        updateUser(prev => ({
          ...prev,
          stats: mergeSpeakingScores(prev.stats, speakingScores)
        }));
      }

      setMessages(prev => [...prev, { role: 'ai', text: fallbackReply }]);
      playAudio(fallbackReply, playbackRate);
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleWordClick = async (word, sentence) => {
    const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
    
    setSelectedWord({ word: cleanWord, loading: true });

    if (VOCAB_DB[cleanWord]) {
      setSelectedWord({ word: cleanWord, ...VOCAB_DB[cleanWord], loading: false });
      return;
    }

    try {
      const prompt = `Give the definition of the English word "${cleanWord}" in the context of this sentence: "${sentence}".
      Return ONLY a valid JSON object with exactly these 3 keys:
      "thai": Thai translation of the word.
      "guide": English pronunciation guide (e.g., "rez-er-VAY-shun").
      "example": A short example English sentence using the word.`;

      const response = await callGemini([{ role: 'user', parts: [{ text: prompt }]}]);
      const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(jsonStr);

      setSelectedWord({
        word: cleanWord,
        thai: data.thai,
        guide: data.guide,
        example: data.example,
        loading: false
      });

      VOCAB_DB[cleanWord] = data;

    } catch (error) {
      console.error("Dictionary API error:", error);
      setSelectedWord({
        word: cleanWord,
        thai: "ไม่สามารถแปลคำศัพท์นี้ได้ในขณะนี้",
        guide: cleanWord,
        example: "Please try again later.",
        loading: false
      });
    }
  };

  const renderMessageText = (text) => {
    return text.split(/\s+/).map((word, i) => {
      const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
      const isPredefined = VOCAB_DB[cleanWord];
      
      return (
        <span 
          key={i} 
          onClick={() => handleWordClick(word, text)} 
          className={`cursor-pointer transition-colors px-[2px] rounded ${
            isPredefined 
              ? 'text-blue-600 underline decoration-dashed decoration-blue-300 hover:bg-blue-50 font-medium' 
              : 'hover:bg-slate-200 hover:text-blue-600'
          }`}
        >
          {word}{' '}
        </span>
      );
    });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <div className="bg-white pt-safe px-4 py-3 border-b border-slate-200 flex items-center justify-between shadow-sm z-10 sticky top-0">
        <button onClick={() => setView('practice')} className="text-slate-500 hover:text-slate-800 font-medium">← Back</button>
        <div className="text-center">
          <h2 className="font-bold text-sm text-slate-800">{situation?.title}</h2>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{situation?.category}</p>
        </div>
        <div className="w-10 text-right">
          <button onClick={() => setPlaybackRate(r => r === 1.0 ? 0.75 : r === 0.75 ? 0.5 : 1.0)} className="bg-slate-100 text-xs px-2 py-1 rounded-md text-slate-600 font-medium">
            {playbackRate}x
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-36">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'ai' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs mr-2 shrink-0 mt-1 shadow-sm">AI</div>
            )}
            
            <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end flex flex-col' : 'items-start flex flex-col'}`}>
              <div className={`p-3.5 rounded-2xl shadow-sm text-[15px] leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-sm' 
                  : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm'
              }`}>
                {msg.role === 'ai' ? renderMessageText(msg.text) : msg.text}
              </div>

              {msg.role === 'ai' && (
                <div className="flex items-center gap-3 mt-2 ml-1">
                  <button onClick={() => playAudio(msg.text)} className="text-slate-400 hover:text-blue-500 transition-colors flex items-center gap-1 text-xs font-medium">
                    <Play size={14} /> Listen
                  </button>
                  <button onClick={() => playAudio(msg.text, 0.5)} className="text-slate-400 hover:text-blue-500 transition-colors flex items-center gap-1 text-xs font-medium">
                    <FastForward size={14} /> Slow
                  </button>
                </div>
              )}
              
              {msg.feedback && (
                <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-xl flex items-start gap-2 shadow-sm w-full animate-in fade-in slide-in-from-top-2">
                  <Sparkles size={16} className="shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <span className="font-bold block mb-0.5">AI Feedback:</span>
                    {msg.feedback}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isAiTyping && (
           <div className="flex justify-start animate-pulse">
             <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs mr-2 shrink-0 shadow-sm">AI</div>
             <div className="bg-white border border-slate-100 p-4 rounded-2xl rounded-tl-sm shadow-sm flex gap-1 items-center h-[48px]">
               <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
               <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
               <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {selectedWord && (
        <div className="absolute inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full sm:w-96 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
            {selectedWord.loading ? (
              <div className="text-center py-10">
                <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-500 font-medium">กำลังแปลคำศัพท์...</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800 capitalize">{selectedWord.word}</h3>
                    <p className="text-slate-500 font-mono text-sm">/{selectedWord.guide}/</p>
                  </div>
                  <button onClick={() => playAudio(selectedWord.word)} className="bg-blue-100 text-blue-600 p-2 rounded-full hover:bg-blue-200 transition-colors">
                    <Play size={20} fill="currentColor" />
                  </button>
                </div>
                
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-wide block mb-1">Thai Meaning</span>
                  <p className="text-lg font-medium text-slate-800">{selectedWord.thai}</p>
                </div>

                <div className="mb-6">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wide block mb-1">Example</span>
                  <p className="text-slate-700 italic border-l-2 border-slate-200 pl-3">"{selectedWord.example}"</p>
                </div>

                <button onClick={() => setSelectedWord(null)} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl hover:bg-slate-800 transition-colors">
                  Got it!
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border-t border-slate-200 p-3 pb-safe-offset-3 sm:p-4 fixed sm:relative bottom-0 w-full z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.03)]">
        <div className="max-w-4xl mx-auto space-y-2">
          {isGuest && (
            <div className={`rounded-2xl border p-3 text-xs ${isGuestLocked ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-indigo-50 border-indigo-100 text-indigo-800'}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold">Guest Demo AI</span>
                <span className="font-black">{guestMessagesLeft}/{GUEST_AI_LIMIT} free messages left</span>
              </div>
              {isGuestCoolingDown && !isGuestLocked && (
                <p className="mt-1 text-indigo-700">Cooldown: {Math.ceil(guestCooldownRemaining / 1000)}s before the next AI message.</p>
              )}
              {isGuestLocked && (
                <div className="mt-2">
                  <p className="font-medium">Free demo limit reached. Create or log in to continue with full progress tracking.</p>
                  <button
                    onClick={() => setView('auth')}
                    className="mt-2 w-full bg-white text-amber-700 border border-amber-200 rounded-xl py-2 font-bold"
                  >
                    Create an account / Log in
                  </button>
                </div>
              )}
            </div>
          )}
          
          <div className="flex justify-end">
            <button 
              onClick={handleSuggestReply} 
              disabled={isAiTyping || isSuggesting || messages.length === 0 || isGuestLocked || isGuestCoolingDown}
              className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors disabled:opacity-50 border border-indigo-100"
            >
              <Sparkles size={14} /> 
              {isSuggesting ? "Thinking..." : "Help Me Answer"}
            </button>
          </div>

          <div className="flex items-end gap-2">
            <button 
              onClick={toggleRecording} 
              title={isRecording ? 'Stop recording' : 'Start speaking'}
              className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Mic size={22} fill={isRecording ? "currentColor" : "none"} />
            </button>
            
            <div className="flex-1 bg-slate-100 rounded-2xl flex items-center border border-transparent focus-within:border-blue-300 focus-within:bg-white transition-all overflow-hidden shadow-inner">
              <textarea 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={isGuestLocked ? "Log in to continue AI conversations..." : isGuestCoolingDown ? "Please wait for cooldown..." : "Type or speak..."}
                className="w-full bg-transparent p-3 max-h-32 min-h-[48px] resize-none outline-none text-[15px]"
                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={isGuestLocked}
              />
            </div>

            <button onClick={handleSend} disabled={!input.trim() || isAiTyping || isGuestLocked || isGuestCoolingDown} className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/30 disabled:opacity-50 disabled:shadow-none hover:bg-blue-700 transition-colors">
              <Send size={20} className="ml-1" />
            </button>
          </div>

          {micStatus && (
            <p className={`text-xs font-medium px-1 ${isRecording ? 'text-red-500' : micStatus.includes('blocked') || micStatus.includes('Could not') || micStatus.includes('failed') ? 'text-amber-600' : 'text-slate-500'}`}>
              {micStatus}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// 5. PROGRESS VIEW
function ProgressView({ user }) {
  const scores = user?.stats || { pronunciation: 0, fluency: 0, vocab: 0 };
  const progress = user?.progress || {};
  const practicedSituations = progress.situations || [];
  const practicedCategories = progress.categories || [];
  const totalSituations = SITUATIONS.reduce((sum, group) => sum + group.items.length, 0);
  const totalCategories = SITUATIONS.length;
  const conversations = progress.conversations || 0;
  const turns = progress.turns || 0;
  const averageSpeakingScore = Math.round((scores.pronunciation + scores.fluency + scores.vocab) / 3);
  const achievementItems = [
    {
      id: 'first-words',
      icon: '🎙️',
      title: 'First Words',
      description: 'Complete your first speaking turn',
      unlocked: turns >= 1,
      progress: Math.min(turns, 1),
      target: 1,
      color: 'blue'
    },
    {
      id: 'streak-3',
      icon: '🔥',
      title: '3-Day Streak',
      description: 'Keep practicing for 3 days',
      unlocked: (user?.streak || 0) >= 3,
      progress: Math.min(user?.streak || 0, 3),
      target: 3,
      color: 'orange'
    },
    {
      id: 'streak-7',
      icon: '⚡',
      title: 'Weekly Spark',
      description: 'Reach a 7-day streak',
      unlocked: (user?.streak || 0) >= 7,
      progress: Math.min(user?.streak || 0, 7),
      target: 7,
      color: 'amber'
    },
    {
      id: 'xp-250',
      icon: '⭐',
      title: 'XP Collector',
      description: 'Earn 250 total XP',
      unlocked: (user?.xp || 0) >= 250,
      progress: Math.min(user?.xp || 0, 250),
      target: 250,
      color: 'indigo'
    },
    {
      id: 'xp-500',
      icon: '🏆',
      title: 'Rising Speaker',
      description: 'Earn 500 total XP',
      unlocked: (user?.xp || 0) >= 500,
      progress: Math.min(user?.xp || 0, 500),
      target: 500,
      color: 'purple'
    },
    {
      id: 'level-5',
      icon: '🚀',
      title: 'Level 5',
      description: 'Reach learner level 5',
      unlocked: (user?.level || 0) >= 5,
      progress: Math.min(user?.level || 0, 5),
      target: 5,
      color: 'sky'
    },
    {
      id: 'three-situations',
      icon: '🧭',
      title: 'Explorer',
      description: 'Try 3 different situations',
      unlocked: practicedSituations.length >= 3,
      progress: Math.min(practicedSituations.length, 3),
      target: 3,
      color: 'emerald'
    },
    {
      id: 'all-categories',
      icon: '🌍',
      title: 'World Ready',
      description: 'Practice every category',
      unlocked: practicedCategories.length >= totalCategories,
      progress: Math.min(practicedCategories.length, totalCategories),
      target: totalCategories,
      color: 'teal'
    },
    {
      id: 'all-situations',
      icon: '🗺️',
      title: 'Scenario Master',
      description: 'Try every situation',
      unlocked: practicedSituations.length >= totalSituations,
      progress: Math.min(practicedSituations.length, totalSituations),
      target: totalSituations,
      color: 'cyan'
    },
    {
      id: 'conversation-10',
      icon: '💬',
      title: 'Talkative',
      description: 'Complete 10 speaking turns',
      unlocked: conversations >= 10,
      progress: Math.min(conversations, 10),
      target: 10,
      color: 'rose'
    },
    {
      id: 'pronunciation-80',
      icon: '🎧',
      title: 'Clear Voice',
      description: 'Reach 80% pronunciation',
      unlocked: scores.pronunciation >= 80,
      progress: Math.min(scores.pronunciation, 80),
      target: 80,
      color: 'green'
    },
    {
      id: 'balanced-75',
      icon: '✨',
      title: 'Balanced Speaker',
      description: 'Average 75% speaking score',
      unlocked: averageSpeakingScore >= 75,
      progress: Math.min(averageSpeakingScore, 75),
      target: 75,
      color: 'violet'
    }
  ];
  const unlockedAchievements = achievementItems.filter(item => item.unlocked).length;

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    sky: 'bg-sky-50 text-sky-600 border-sky-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    violet: 'bg-violet-50 text-violet-600 border-violet-100'
  };
  
  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6 pb-20">
      <header className="pt-4 mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Your Progress</h2>
        <p className="text-slate-500 text-sm">Track your English speaking journey.</p>
      </header>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-indigo-500 mb-2"><BarChart size={24} /></div>
          <div className="text-2xl font-bold text-slate-800">{user?.xp}</div>
          <div className="text-xs text-slate-500 font-medium">Total XP Earned</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="text-orange-500 mb-2"><Zap size={24} /></div>
          <div className="text-2xl font-bold text-slate-800">{user?.streak} Days</div>
          <div className="text-xs text-slate-500 font-medium">Current Streak</div>
        </div>
      </div>

      {/* Skill Analysis */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-6">
        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><TrendingUp size={20} className="text-blue-500" /> AI Speaking Analysis</h3>
        
        <div>
          <div className="flex justify-between text-sm mb-1.5 font-medium">
            <span className="text-slate-700">Pronunciation</span>
            <span className={scores.pronunciation > 80 ? 'text-green-600' : 'text-orange-500'}>{scores.pronunciation}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div className="bg-green-500 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${scores.pronunciation}%` }}></div>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1.5 font-medium">
            <span className="text-slate-700">Fluency & Flow</span>
            <span className={scores.fluency > 80 ? 'text-blue-600' : 'text-orange-500'}>{scores.fluency}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div className="bg-blue-500 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${scores.fluency}%` }}></div>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1.5 font-medium">
            <span className="text-slate-700">Vocabulary Variety</span>
            <span className={scores.vocab > 80 ? 'text-purple-600' : 'text-orange-500'}>{scores.vocab}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div className="bg-purple-500 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${scores.vocab}%` }}></div>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div>
         <div className="flex items-end justify-between gap-4 mb-4 mt-8">
           <div>
             <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Shield size={20} className="text-amber-500" /> Achievements</h3>
             <p className="text-xs text-slate-500 font-medium mt-1">{unlockedAchievements} of {achievementItems.length} unlocked</p>
           </div>
           <div className="bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1.5 rounded-full text-xs font-bold">
             {Math.round((unlockedAchievements / achievementItems.length) * 100)}%
           </div>
         </div>

         <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
           {achievementItems.map(item => {
             const percent = Math.min(100, Math.round((item.progress / item.target) * 100));
             return (
               <div key={item.id} className={`bg-white border p-4 rounded-2xl shadow-sm transition-all ${item.unlocked ? 'border-slate-100' : 'border-slate-200 opacity-70'}`}>
                 <div className="flex items-start justify-between gap-2 mb-3">
                   <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-2xl ${item.unlocked ? colorClasses[item.color] : 'bg-slate-100 text-slate-400 border-slate-200 grayscale'}`}>
                     {item.icon}
                   </div>
                   <span className={`text-[10px] font-black px-2 py-1 rounded-full ${item.unlocked ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                     {item.unlocked ? 'UNLOCKED' : 'LOCKED'}
                   </span>
                 </div>
                 <h4 className="font-bold text-sm text-slate-800 leading-tight">{item.title}</h4>
                 <p className="text-[11px] text-slate-500 mt-1 min-h-[32px] leading-snug">{item.description}</p>
                 <div className="mt-3">
                   <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                     <span>{item.progress}/{item.target}</span>
                     <span>{percent}%</span>
                   </div>
                   <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                     <div className={`h-1.5 rounded-full transition-all duration-700 ${item.unlocked ? 'bg-green-500' : 'bg-slate-300'}`} style={{ width: `${percent}%` }}></div>
                   </div>
                 </div>
               </div>
             );
           })}
         </div>
      </div>
    </div>
  );
}

// 6. PROFILE VIEW
function ProfileView({ user, updateUser, availableVoices, selectedVoiceKey, onVoiceChange, onLogout }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editAvatar, setEditAvatar] = useState(user?.avatar || '👦');
  const [editGoal, setEditGoal] = useState(user?.goal || 'พูดภาษาอังกฤษในชีวิตประจำวันให้มั่นใจ');
  const [editVoiceKey, setEditVoiceKey] = useState(user?.ttsVoiceKey || selectedVoiceKey || '');
  const englishVoices = (availableVoices || [])
    .filter(voice => rankEnglishVoice(voice) > 0)
    .sort((a, b) => rankEnglishVoice(b) - rankEnglishVoice(a));
  const selectedVoice = pickBestEnglishVoice(availableVoices, editVoiceKey || selectedVoiceKey);

  const handleSave = () => {
    // 🟢 อัปเดตข้อมูลผ่านตัวจัดการหลัก ซึ่งจะส่งข้อมูลทั้งหมดเข้าสู่ฐานข้อมูลด้วย
    updateUser({
      name: editName,
      avatar: editAvatar,
      goal: editGoal,
      ttsVoiceKey: editVoiceKey,
      ttsVoiceName: selectedVoice?.name || ''
    });
    setIsEditing(false);
  };

  const AVATARS = ['👦', '👧', '👨', '👩', '🤖', '🐶', '🐱', '🐼'];

  if (isEditing) {
    return (
      <div className="p-4 sm:p-8 max-w-md mx-auto space-y-6 pb-20 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6 pt-4">
          <h2 className="text-2xl font-bold text-slate-800">Edit Profile</h2>
          <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-slate-700 font-medium text-sm bg-slate-100 px-3 py-1.5 rounded-full">Cancel</button>
        </div>
        
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-2">Avatar</label>
            <div className="flex gap-2 flex-wrap justify-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
              {AVATARS.map(a => (
                <button 
                  key={a} 
                  onClick={() => setEditAvatar(a)} 
                  className={`text-3xl p-2 rounded-full transition-all ${editAvatar === a ? 'bg-blue-100 scale-110 shadow-sm' : 'hover:scale-110 grayscale opacity-40 hover:grayscale-0 hover:opacity-100'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Display Name</label>
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Learning Goal</label>
            <input type="text" value={editGoal} onChange={e => setEditGoal(e.target.value)} placeholder="e.g. อยากสัมภาษณ์งานผ่าน" className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">English Voice</label>
            <select
              value={editVoiceKey}
              onChange={e => setEditVoiceKey(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            >
              <option value="">Auto: {getVoiceLabel(pickBestEnglishVoice(availableVoices))}</option>
              {englishVoices.map(voice => (
                <option key={getVoiceKey(voice)} value={getVoiceKey(voice)}>
                  {getVoiceLabel(voice)}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between gap-3 mt-2">
              <p className="text-[11px] text-slate-500 leading-snug">
                Current: {getVoiceLabel(selectedVoice)}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!('speechSynthesis' in window)) return;
                  const previewVoice = pickBestEnglishVoice(availableVoices, editVoiceKey);
                  window.speechSynthesis.cancel();
                  const utterance = new SpeechSynthesisUtterance("Hello, let's practice English together.");
                  if (previewVoice) {
                    utterance.voice = previewVoice;
                    utterance.lang = previewVoice.lang || 'en-US';
                  }
                  utterance.rate = 0.92;
                  utterance.pitch = 1.02;
                  utterance.volume = 1;
                  window.speechSynthesis.speak(utterance);
                }}
                className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100"
              >
                Test Voice
              </button>
            </div>
          </div>

          <button onClick={handleSave} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-md mt-6">
            Save Changes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-md mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 text-center mt-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-blue-50 to-indigo-50"></div>
        <div className="w-24 h-24 bg-white rounded-full mx-auto flex items-center justify-center text-5xl mb-4 shadow-sm border-4 border-white relative z-10">
          {user?.avatar || '👦'}
        </div>
        {user?.isGuest && (
          <div className="relative z-10 inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide mb-3">
            <Sparkles size={12} /> Guest Demo Mode
          </div>
        )}
        <h2 className="text-xl font-bold text-slate-800 relative z-10">{user?.name}</h2>
        <p className="text-sm text-slate-500 font-mono mt-1 relative z-10">ID: {user?.id}</p>
        
        <div className="mt-6 bg-slate-50 rounded-2xl p-4 flex justify-around border border-slate-100 shadow-inner">
           <div className="text-center">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Level</div>
              <div className="text-xl font-black text-blue-600">{user?.level}</div>
           </div>
           <div className="w-px bg-slate-200"></div>
           <div className="text-center">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total XP</div>
              <div className="text-xl font-black text-indigo-600">{user?.xp}</div>
           </div>
           <div className="w-px bg-slate-200"></div>
           <div className="text-center">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Streak</div>
              <div className="text-xl font-black text-orange-500 flex justify-center items-center gap-1">
                <Zap size={16} fill="currentColor" /> {user?.streak}
              </div>
           </div>
        </div>
      </div>

      {user?.isGuest && (
        <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-bold mb-1">You are using Guest Demo Mode.</p>
          <p className="text-xs leading-relaxed text-indigo-700">Progress, leaderboard, and classroom features are disabled. Demo AI is limited to 5 messages per session.</p>
          <button
            onClick={onLogout}
            className="mt-3 w-full bg-white text-indigo-700 border border-indigo-100 font-bold py-3 rounded-xl hover:bg-indigo-100 transition-colors"
          >
            Login for full progress tracking
          </button>
        </div>
      )}

      <div className="space-y-3">
        <button onClick={() => setIsEditing(true)} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between shadow-sm border border-slate-100 active:scale-[0.98] transition-all hover:border-blue-300 hover:shadow-md group">
          <div className="flex items-center gap-3 text-slate-700 font-medium">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors"><Settings size={18} /></div> Edit Profile
          </div>
          <span className="text-slate-300 group-hover:text-blue-500 transition-colors">→</span>
        </button>
        <div className="w-full bg-white p-4 rounded-2xl flex flex-col justify-between shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 text-slate-700 font-medium mb-2">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><BookOpen size={18} /></div> Learning Goal
          </div>
          <p className="text-sm text-slate-600 pl-11 italic">"{user?.goal || 'พูดภาษาอังกฤษในชีวิตประจำวันให้มั่นใจ'}"</p>
        </div>
      </div>

      <div className="w-full bg-white p-4 rounded-2xl flex flex-col justify-between shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 text-slate-700 font-medium mb-2">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Mic size={18} /></div> Voice
        </div>
        <p className="text-sm text-slate-600 pl-11">{getVoiceLabel(pickBestEnglishVoice(availableVoices, user?.ttsVoiceKey || selectedVoiceKey))}</p>
      </div>

      <button onClick={onLogout} className="w-full bg-red-50 text-red-600 font-bold p-4 rounded-2xl flex items-center justify-center gap-2 mt-8 hover:bg-red-100 transition-colors shadow-sm">
        <LogOut size={20} /> Log Out
      </button>
    </div>
  );
}

// 7. TEACHER DASHBOARD
function TeacherDashboard({ user, onLogout }) {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: 'get_dashboard',
            payload: { classroomId: user?.classroomId || 'CLASS1' }
          })
        });
        const result = await response.json();
        
        // 🟢 ดึงข้อมูลจากฐานข้อมูลจริงเท่านั้น (ไม่ใช้ข้อมูลจำลองแล้ว)
        if (result.success && result.students) {
          setStudents(result.students);
        } else {
          setStudents([]); // ให้เป็นตารางว่างถ้าดึงไม่สำเร็จหรือไม่มีข้อมูล
        }
      } catch (error) {
        console.error("ดึงข้อมูล Dashboard ล้มเหลว:", error);
        setStudents([]); // ถ้าเน็ตหลุด ให้เป็นตารางว่าง
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <header className="max-w-6xl mx-auto flex justify-between items-center bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Users className="text-indigo-600" /> Teacher Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Welcome back, {user?.name}</p>
        </div>
        <button onClick={onLogout} className="text-slate-500 hover:text-red-500 font-medium text-sm flex items-center gap-1">
          <LogOut size={16} /> Logout
        </button>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-3 grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-1">Total Students</p>
            <p className="text-3xl font-bold text-indigo-600">{isLoading ? '...' : students.length}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-1">Active Today</p>
            <p className="text-3xl font-bold text-emerald-600">{isLoading ? '...' : students.filter(s => s.lastActive === 'Today').length || 0}</p>
          </div>
        </div>

        <div className="md:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-lg text-slate-800">Classroom Overview</h3>
            <button className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100">Add Student</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">Student</th>
                  <th className="p-4 font-semibold text-center">Level</th>
                  <th className="p-4 font-semibold text-center">XP</th>
                  <th className="p-4 font-semibold text-center">Streak</th>
                  <th className="p-4 font-semibold text-right">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-500">
                      <div className="inline-block w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-2"></div>
                      <p>กำลังโหลดข้อมูลนักเรียน...</p>
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-500 font-medium">
                      ยังไม่มีข้อมูลนักเรียนในห้องเรียนนี้
                    </td>
                  </tr>
                ) : (
                  students.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-medium text-slate-800 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">{s.name.charAt(0)}</div>
                        <div>
                          {s.name}
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{s.id}</div>
                        </div>
                      </td>
                      <td className="p-4 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-bold">{s.level}</span></td>
                      <td className="p-4 text-center text-slate-600 font-medium">{s.xp}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1 font-bold ${s.streak > 0 ? 'text-orange-500' : 'text-slate-400'}`}>
                          <Zap size={14} fill={s.streak > 0 ? "currentColor" : "none"} /> {s.streak}
                        </span>
                      </td>
                      <td className="p-4 text-right text-slate-500">{s.lastActive}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h3 className="font-bold text-lg text-slate-800 mb-4">Actions</h3>
          <button className="w-full bg-slate-50 border border-slate-200 hover:border-indigo-300 text-slate-700 p-4 rounded-2xl flex items-center gap-3 transition-colors text-left text-sm font-medium">
            <span className="bg-white p-2 rounded-xl shadow-sm text-indigo-600"><BookOpen size={18} /></span>
            Assign Conversation
          </button>
          <button className="w-full bg-slate-50 border border-slate-200 hover:border-indigo-300 text-slate-700 p-4 rounded-2xl flex items-center gap-3 transition-colors text-left text-sm font-medium">
            <span className="bg-white p-2 rounded-xl shadow-sm text-emerald-600"><BarChart size={18} /></span>
            Export CSV Report
          </button>
          <button className="w-full bg-slate-50 border border-slate-200 hover:border-indigo-300 text-slate-700 p-4 rounded-2xl flex items-center gap-3 transition-colors text-left text-sm font-medium">
            <span className="bg-white p-2 rounded-xl shadow-sm text-blue-600"><Settings size={18} /></span>
            Classroom Settings
          </button>
        </div>
      </div>
    </div>
  );
}
