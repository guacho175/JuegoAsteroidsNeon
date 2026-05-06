import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Heart, Play, RefreshCcw, Pause, Terminal, ListOrdered, Menu, X, Save, User, ArrowUp, ArrowLeft, ArrowRight, Focus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Tipos del Motor ---
type Vector = { x: number; y: number };
type Particle = { p: Vector; v: Vector; life: number; maxLife: number; color: string };
type Projectile = { p: Vector; v: Vector; life: number; active: boolean };
type Asteroid = { p: Vector; v: Vector; radius: number; points: number[]; active: boolean; stage: number; rotationSpeed: number; angle: number };
type Ship = { p: Vector; v: Vector; angle: number; radius: number; thrusting: boolean; active: boolean; invulnerable: number };

interface ScoreEntry {
  name: string;
  score: number;
  date: string;
}

const SHOOT_DELAY = 15;
const FRICTION = 0.99;
const THRUST = 0.15;
const ROTATION_SPEED = 0.08;
const SHEET_URL = "https://script.google.com/macros/s/AKfycbwk6I3OvEN4GL1zjBcDvarlN_LVGrKWHXYbFVIOgXOOC1_Us1gEnT0dHIEiEkZLApuV/exec";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [gameState, setGameState] = useState<{
    score: number;
    highScore: number;
    lives: number;
    level: number;
    status: 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'WIN';
  }>({
    score: 0,
    highScore: parseInt(localStorage.getItem('asteroids_neon_highscore') || '0'),
    lives: 3,
    level: 1,
    status: 'START'
  });

  const [ranking, setRanking] = useState<ScoreEntry[]>([]);
  const [isLoadingRanking, setIsLoadingRanking] = useState(false);
  const [isRankingOpen, setIsRankingOpen] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [hasSaved, setHasSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const keys = useRef<{ [key: string]: boolean }>({});
  const touchState = useRef({ left: false, right: false, thrust: false, shoot: false });
  const reqRef = useRef<number>(0);

  const state = useRef({
    score: 0,
    ship: { p: { x: 0, y: 0 }, v: { x: 0, y: 0 }, angle: -Math.PI / 2, radius: 15, thrusting: false, active: false, invulnerable: 0 } as Ship,
    asteroids: [] as Asteroid[],
    projectiles: [] as Projectile[],
    particles: [] as Particle[],
    w: 0,
    h: 0,
    shootCooldown: 0
  });

  // Load Ranking
  useEffect(() => {
    const loadRanking = async () => {
      setIsLoadingRanking(true);
      try {
        const res = await fetch(`${SHEET_URL}?juego=asteroids`, { cache: 'no-store' });
        if (res.ok) {
          const data: any[] = await res.json();
          const parsed: ScoreEntry[] = data.map(row => ({
            name: String(row.nombre || 'ANON'),
            score: parseInt(row.puntos, 10) || 0,
            date: String(row.fecha || '')
          }));
          const sorted = parsed.sort((a, b) => b.score - a.score).slice(0, 10);
          setRanking(sorted);
        }
      } catch (error) {
        console.error("Fallo conectando a Apps Script", error);
        const saved = JSON.parse(localStorage.getItem('asteroids_neon_ranking') || '[]');
        setRanking(saved);
      } finally {
        setIsLoadingRanking(false);
      }
    };
    loadRanking();
    window.addEventListener('rankingUpdated', loadRanking);
    return () => window.removeEventListener('rankingUpdated', loadRanking);
  }, []);

  // Controls bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const saveScore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!playerName.trim() || isSaving) return;
    setIsSaving(true);
    const entryData = {
      juego: 'asteroids',
      nombre: String(playerName.trim()).substring(0, 25),
      puntos: gameState.score
    };
    try {
      await fetch(SHEET_URL, { method: 'POST', body: JSON.stringify(entryData) });
    } catch (err) {
      console.error('Error saving:', err);
    }
    const entry = { name: entryData.nombre, score: gameState.score, date: new Date().toLocaleDateString() };
    const prev = JSON.parse(localStorage.getItem('asteroids_neon_ranking') || '[]') as ScoreEntry[];
    const next = [...prev, entry].sort((a, b) => b.score - a.score).slice(0, 10);
    localStorage.setItem('asteroids_neon_ranking', JSON.stringify(next));
    setHasSaved(true);
    setIsSaving(false);
    window.dispatchEvent(new Event('rankingUpdated'));
  };

  const spawnAsteroid = (x: number, y: number, stage: number) => {
    const points = [];
    const numPoints = 8 + Math.random() * 4;
    for (let i = 0; i < numPoints; i++) {
      points.push(Math.random() * 0.4 + 0.8);
    }
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 1.5 + 0.5) * (stage === 3 ? 1 : stage === 2 ? 1.5 : 2);
    
    state.current.asteroids.push({
      p: { x, y },
      v: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      radius: stage === 3 ? 40 : stage === 2 ? 20 : 10,
      points,
      active: true,
      stage,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      angle: 0
    });
  };

  const spawnParticles = (x: number, y: number, color: string, amount: number) => {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      state.current.particles.push({
        p: { x, y },
        v: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life: 0,
        maxLife: 20 + Math.random() * 20,
        color
      });
    }
  };

  const initGame = (level: number, keepScore = false) => {
    const s = state.current;
    if (canvasRef.current) {
      s.w = canvasRef.current.width = window.innerWidth;
      s.h = canvasRef.current.height = window.innerHeight;
    }
    
    s.ship = { 
      p: { x: s.w / 2, y: s.h / 2 }, 
      v: { x: 0, y: 0 }, 
      angle: -Math.PI / 2, 
      radius: 15, 
      thrusting: false, 
      active: true,
      invulnerable: 120 
    };
    
    s.asteroids = [];
    s.projectiles = [];
    s.particles = [];
    if (!keepScore) s.score = 0;

    const numAsteroids = 3 + level;
    for (let i = 0; i < numAsteroids; i++) {
      let x, y;
      do {
        x = Math.random() * s.w;
        y = Math.random() * s.h;
      } while (Math.hypot(x - s.ship.p.x, y - s.ship.p.y) < 150); // Avoid spawning on ship
      spawnAsteroid(x, y, 3);
    }
  };

  const startGame = () => {
    setHasSaved(false);
    setPlayerName('');
    initGame(1);
    setGameState(prev => ({ ...prev, status: 'PLAYING', lives: 3, score: 0, level: 1 }));
  };

  const update = () => {
    if (gameState.status !== 'PLAYING') return;
    const s = state.current;
    
    // Controls
    if (s.ship.active) {
      if (keys.current['ArrowLeft'] || touchState.current.left) s.ship.angle -= ROTATION_SPEED;
      if (keys.current['ArrowRight'] || touchState.current.right) s.ship.angle += ROTATION_SPEED;
      
      s.ship.thrusting = keys.current['ArrowUp'] || touchState.current.thrust;
      if (s.ship.thrusting) {
        s.ship.v.x += Math.cos(s.ship.angle) * THRUST;
        s.ship.v.y += Math.sin(s.ship.angle) * THRUST;
        spawnParticles(
          s.ship.p.x - Math.cos(s.ship.angle) * s.ship.radius,
          s.ship.p.y - Math.sin(s.ship.angle) * s.ship.radius,
          '#ff0055',
          1
        );
      }
      
      s.ship.v.x *= FRICTION;
      s.ship.v.y *= FRICTION;
      s.ship.p.x += s.ship.v.x;
      s.ship.p.y += s.ship.v.y;
      
      if (s.ship.p.x < 0) s.ship.p.x += s.w;
      if (s.ship.p.x > s.w) s.ship.p.x -= s.w;
      if (s.ship.p.y < 0) s.ship.p.y += s.h;
      if (s.ship.p.y > s.h) s.ship.p.y -= s.h;

      if (s.ship.invulnerable > 0) s.ship.invulnerable--;

      if (s.shootCooldown > 0) s.shootCooldown--;
      if ((keys.current['Space'] || touchState.current.shoot) && s.shootCooldown <= 0) {
        s.projectiles.push({
          p: { x: s.ship.p.x + Math.cos(s.ship.angle) * s.ship.radius, y: s.ship.p.y + Math.sin(s.ship.angle) * s.ship.radius },
          v: { x: Math.cos(s.ship.angle) * 10, y: Math.sin(s.ship.angle) * 10 },
          life: 60,
          active: true
        });
        s.shootCooldown = SHOOT_DELAY;
      }
    }

    // Projectiles
    s.projectiles.forEach(p => {
      p.p.x += p.v.x;
      p.p.y += p.v.y;
      if (p.p.x < 0) p.p.x += s.w;
      if (p.p.x > s.w) p.p.x -= s.w;
      if (p.p.y < 0) p.p.y += s.h;
      if (p.p.y > s.h) p.p.y -= s.h;
      p.life--;
      if (p.life <= 0) p.active = false;
    });
    s.projectiles = s.projectiles.filter(p => p.active);

    // Particles
    s.particles.forEach(p => {
      p.p.x += p.v.x;
      p.p.y += p.v.y;
      p.life++;
    });
    s.particles = s.particles.filter(p => p.life < p.maxLife);

    // Asteroids
    s.asteroids.forEach(a => {
      a.p.x += a.v.x;
      a.p.y += a.v.y;
      a.angle += a.rotationSpeed;
      if (a.p.x < -a.radius) a.p.x = s.w + a.radius;
      if (a.p.x > s.w + a.radius) a.p.x = -a.radius;
      if (a.p.y < -a.radius) a.p.y = s.h + a.radius;
      if (a.p.y > s.h + a.radius) a.p.y = -a.radius;
    });

    // Collisions
    for (let i = s.asteroids.length - 1; i >= 0; i--) {
      const a = s.asteroids[i];
      if (!a.active) continue;

      // Asteroid vs Ship
      if (s.ship.active && s.ship.invulnerable <= 0) {
        const dist = Math.hypot(s.ship.p.x - a.p.x, s.ship.p.y - a.p.y);
        if (dist < s.ship.radius + a.radius) {
          s.ship.active = false;
          spawnParticles(s.ship.p.x, s.ship.p.y, '#00ffff', 50);
          setGameState(prev => {
            const nextLives = prev.lives - 1;
            if (nextLives <= 0) {
              if (s.score > prev.highScore) {
                localStorage.setItem('asteroids_neon_highscore', s.score.toString());
              }
              return { ...prev, score: s.score, lives: 0, status: 'GAMEOVER', highScore: Math.max(s.score, prev.highScore) };
            }
            setTimeout(() => {
              s.ship.active = true;
              s.ship.p = { x: s.w / 2, y: s.h / 2 };
              s.ship.v = { x: 0, y: 0 };
              s.ship.invulnerable = 120;
            }, 1000);
            return { ...prev, score: s.score, lives: nextLives };
          });
        }
      }

      // Asteroid vs Projectiles
      for (let j = s.projectiles.length - 1; j >= 0; j--) {
        const p = s.projectiles[j];
        if (!p.active) continue;
        const dist = Math.hypot(p.p.x - a.p.x, p.p.y - a.p.y);
        if (dist < a.radius) {
          p.active = false;
          a.active = false;
          spawnParticles(a.p.x, a.p.y, '#aa00ff', 20);
          
          let pointsAdded = 0;
          if (a.stage === 3) {
            spawnAsteroid(a.p.x, a.p.y, 2);
            spawnAsteroid(a.p.x, a.p.y, 2);
            pointsAdded = 20;
          } else if (a.stage === 2) {
            spawnAsteroid(a.p.x, a.p.y, 1);
            spawnAsteroid(a.p.x, a.p.y, 1);
            pointsAdded = 50;
          } else {
            pointsAdded = 100;
          }
          
          s.score += pointsAdded;
          setGameState(prev => ({ ...prev, score: s.score }));
          break;
        }
      }
    }

    s.asteroids = s.asteroids.filter(a => a.active);

    // Win check
    if (s.asteroids.length === 0 && s.ship.active) {
      setGameState(prev => ({ ...prev, status: 'WIN' }));
    }
  };

  const draw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const s = state.current;

    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(0, 0, s.w, s.h);

    // Draw Particles
    s.particles.forEach(p => {
      ctx.globalAlpha = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.p.x, p.p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw Projectiles
    ctx.fillStyle = '#00ffff';
    s.projectiles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.p.x, p.p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Asteroids
    ctx.strokeStyle = '#aa00ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#aa00ff';
    s.asteroids.forEach(a => {
      ctx.save();
      ctx.translate(a.p.x, a.p.y);
      ctx.rotate(a.angle);
      ctx.beginPath();
      for (let i = 0; i < a.points.length; i++) {
        const angle = (i / a.points.length) * Math.PI * 2;
        const radius = a.radius * a.points[i];
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    });

    // Draw Ship
    if (s.ship.active) {
      if (s.ship.invulnerable > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
        // blink
      } else {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffff';
        ctx.save();
        ctx.translate(s.ship.p.x, s.ship.p.y);
        ctx.rotate(s.ship.angle);
        ctx.beginPath();
        ctx.moveTo(s.ship.radius, 0);
        ctx.lineTo(-s.ship.radius, s.ship.radius * 0.7);
        ctx.lineTo(-s.ship.radius * 0.5, 0);
        ctx.lineTo(-s.ship.radius, -s.ship.radius * 0.7);
        ctx.closePath();
        ctx.stroke();
        
        if (s.ship.thrusting) {
          ctx.strokeStyle = '#ff0055';
          ctx.beginPath();
          ctx.moveTo(-s.ship.radius * 0.5, 0);
          ctx.lineTo(-s.ship.radius * 1.5, s.ship.radius * 0.3);
          ctx.lineTo(-s.ship.radius * 1.2, 0);
          ctx.lineTo(-s.ship.radius * 1.5, -s.ship.radius * 0.3);
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.shadowBlur = 0;
  };

  useEffect(() => {
    const loop = () => {
      update();
      draw();
      reqRef.current = requestAnimationFrame(loop);
    };
    reqRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqRef.current);
  }, [gameState.status]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        state.current.w = canvasRef.current.width = window.innerWidth;
        state.current.h = canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const nextLevel = () => {
    setGameState(prev => {
      const nextLvl = prev.level + 1;
      initGame(nextLvl, true);
      return { ...prev, status: 'PLAYING', level: nextLvl };
    });
  };

  const togglePause = () => {
    const newStatus = gameState.status === 'PAUSED' ? 'PLAYING' : 'PAUSED';
    setGameState(prev => ({ ...prev, status: newStatus }));
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0c0c0e] flex flex-col font-sans selection:bg-cyan-500/30 relative select-none">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon-cyan/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neon-magenta/20 rounded-full blur-[120px]" />
      </div>

      <motion.header
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="absolute top-0 w-full pt-1.5 sm:pt-3 pb-1 px-4 flex flex-col items-center z-50 bg-transparent flex-shrink-0"
      >
        <div className="flex items-baseline gap-2 sm:gap-3">
          <h1 className="text-lg sm:text-2xl font-black italic text-slate-100 tracking-tighter uppercase relative">
            ASTEROIDS
            <span className="text-neon-cyan mx-1">Neón</span>
          </h1>
        </div>
      </motion.header>

      <div className="flex-1 flex flex-col w-full z-10 relative min-h-0">
        <button 
          className="lg:hidden absolute top-2 left-2 z-50 p-1.5 bg-black/50 border border-white/10 rounded text-neon-magenta hover:bg-neon-magenta/20 transition-colors"
          onClick={() => setIsRankingOpen(!isRankingOpen)}
        >
          {isRankingOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <motion.aside
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: isRankingOpen ? 0 : (window.innerWidth < 1024 ? -300 : 0), opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={`w-56 lg:w-44 xl:w-52 p-2 sm:p-3 lg:border-r border-slate-800 bg-slate-900/90 lg:bg-slate-900/40 backdrop-blur-xl flex flex-col fixed lg:absolute lg:left-0 lg:top-0 lg:bottom-0 top-12 left-2 bottom-20 z-40 rounded-xl lg:rounded-none ${isRankingOpen ? 'flex' : 'hidden lg:flex'}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <ListOrdered className="w-3.5 h-3.5 text-neon-magenta" />
            <h2 className="text-[10px] sm:text-xs font-bold text-slate-100 uppercase tracking-widest italic">Ranking</h2>
          </div>

          <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 max-h-[90px] lg:max-h-none">
            {isLoadingRanking ? (
              <div className="flex flex-col items-center justify-center py-4">
                <p className="text-[8px] font-mono text-neon-cyan uppercase tracking-widest animate-pulse">Sincronizando...</p>
              </div>
            ) : ranking.length > 0 ? (
              ranking.map((entry, index) => (
                <div key={index} className="group flex flex-col p-1 bg-slate-800/20 border border-slate-700/30 rounded hover:border-neon-magenta/50 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className={`font-mono font-black italic text-[10px] ${index < 3 ? 'text-neon-cyan' : 'text-slate-600'}`}>{index + 1}</span>
                      <p className="text-[8px] sm:text-[9px] font-bold text-slate-100 uppercase truncate max-w-[50px] sm:max-w-[70px]">{entry.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] sm:text-[10px] font-black text-neon-magenta leading-none">{entry.score}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-2 border border-dashed border-slate-800 rounded">
                <p className="text-[7px] font-mono text-slate-600 uppercase">Vacío</p>
              </div>
            )}
          </div>
        </motion.aside>

        <main className="flex-1 w-full h-full relative touch-none">
          <div className="absolute top-12 left-0 right-0 z-30 flex justify-center pointer-events-none">
             <div className="w-full max-w-4xl flex justify-between items-center px-4">
              <div className="flex items-center gap-4 bg-black/40 p-2 rounded-xl border border-white/10 backdrop-blur-md">
                <div className="flex flex-col">
                  <span className="text-[8px] uppercase tracking-widest text-white/40 font-mono">Current Score</span>
                  <div className="flex items-center gap-1">
                    <Terminal size={12} className="text-neon-cyan" />
                    <span className="text-lg font-bold text-neon-cyan tabular-nums">{gameState.score.toString().padStart(6, '0')}</span>
                  </div>
                </div>
                <div className="flex flex-col border-l border-white/10 pl-4">
                  <span className="text-[8px] uppercase tracking-widest text-white/40 font-mono">High Score</span>
                  <div className="flex items-center gap-1">
                    <Trophy size={12} className="text-neon-magenta" />
                    <span className="text-lg font-bold text-neon-magenta tabular-nums">{gameState.highScore.toString().padStart(6, '0')}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/10 backdrop-blur-md pointer-events-auto">
                <div className="flex gap-1 mr-2">
                  {Array.from({ length: gameState.lives }).map((_, i) => (
                    <Heart key={i} size={14} className="fill-neon-yellow text-neon-yellow" />
                  ))}
                </div>
                <button onClick={togglePause} className="p-1.5 rounded-lg text-neon-cyan hover:bg-white/5 transition-colors">
                  {gameState.status === 'PAUSED' ? <Play size={14} /> : <Pause size={14} />}
                </button>
              </div>
            </div>
          </div>

          <canvas ref={canvasRef} className="absolute inset-0 block touch-none" />

          {/* UI Overlays */}
          <AnimatePresence>
            {(gameState.status === 'START' || gameState.status === 'GAMEOVER' || gameState.status === 'WIN' || gameState.status === 'PAUSED') && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="max-w-md w-full bg-black/60 border border-white/10 p-8 rounded-3xl shadow-2xl text-center">
                  {gameState.status === 'START' && (
                    <>
                      <h2 className="text-4xl font-black mb-2 uppercase italic tracking-tighter">Iniciando Protocolo</h2>
                      <p className="text-white/60 mb-8 font-light leading-relaxed">Destruye los <span className="text-neon-magenta font-semibold">Asteroides</span> y sobrevive.</p>
                      <motion.button onClick={startGame} className="w-full py-4 bg-neon-cyan text-black font-black rounded-xl uppercase tracking-widest flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(0,255,255,0.4)]">
                        <Play fill="black" size={20} /> Ejecutar Sesión
                      </motion.button>
                    </>
                  )}

                  {gameState.status === 'GAMEOVER' && (
                    <div className="w-full text-center">
                      <h2 className="text-4xl font-black mb-2 uppercase italic tracking-tighter text-red-500 underline decoration-red-500/50 underline-offset-8">NAVE DESTRUIDA</h2>
                      <p className="text-2xl font-bold mb-6 text-neon-magenta">PUNTOS: {gameState.score}</p>
                      {!hasSaved ? (
                        <form onSubmit={saveScore} className="space-y-2.5 text-left mb-6">
                          <p className="text-[9px] uppercase font-mono text-white/50 pl-1">Nombre para el ranking</p>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
                            <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="TU NOMBRE" className="w-full bg-black/50 border border-white/20 focus:border-neon-cyan px-9 py-3 rounded-xl text-white placeholder:text-white/30 font-mono uppercase text-xs focus:outline-none transition-colors" maxLength={10} autoFocus />
                          </div>
                          <button type="submit" disabled={!playerName.trim() || isSaving} className="w-full flex items-center justify-center gap-2 py-3 font-bold uppercase tracking-widest rounded-xl text-xs text-black transition-all bg-neon-cyan hover:bg-[#00d0d0] disabled:opacity-40">
                            {isSaving ? <span className="animate-pulse">Guardando...</span> : <><Save className="w-3.5 h-3.5" /> Guardar Score</>}
                          </button>
                        </form>
                      ) : (
                        <motion.p initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="font-mono text-xs uppercase text-green-400 py-3">✓ ¡Puntuación guardada!</motion.p>
                      )}
                      <motion.button onClick={startGame} className="w-full py-4 bg-transparent border border-neon-cyan text-neon-cyan font-black rounded-xl uppercase tracking-widest flex items-center justify-center gap-3">
                        <RefreshCcw size={20} /> Reiniciar Núcleo
                      </motion.button>
                    </div>
                  )}

                  {gameState.status === 'WIN' && (
                    <>
                      <h2 className="text-4xl font-black mb-2 uppercase italic tracking-tighter text-green-400">SECTOR DESPEJADO</h2>
                      <p className="text-2xl font-bold mb-8 text-neon-yellow">PUNTOS: {gameState.score}</p>
                      <motion.button onClick={nextLevel} className="w-full py-4 bg-green-500 text-black font-black rounded-xl uppercase tracking-widest flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(34,197,94,0.4)]">
                        <RefreshCcw size={20} /> Siguiente Nivel
                      </motion.button>
                    </>
                  )}

                  {gameState.status === 'PAUSED' && (
                    <>
                      <h2 className="text-4xl font-black mb-2 uppercase italic tracking-tighter">PAUSA</h2>
                      <motion.button onClick={togglePause} className="w-full py-4 bg-transparent border border-neon-cyan text-neon-cyan font-black rounded-xl uppercase tracking-widest flex items-center justify-center gap-3">
                        <Play fill="currentColor" size={20} /> Reanudar
                      </motion.button>
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* On-Screen Mobile Controls */}
          {gameState.status === 'PLAYING' && (
            <div className="absolute bottom-6 left-0 right-0 flex justify-between px-6 z-40 lg:hidden pointer-events-none">
              <div className="flex gap-4 pointer-events-auto">
                <button
                  className="w-16 h-16 rounded-full bg-black/40 border-2 border-white/20 flex items-center justify-center active:bg-white/20 active:border-neon-cyan backdrop-blur-md"
                  onPointerDown={() => touchState.current.left = true}
                  onPointerUp={() => touchState.current.left = false}
                  onPointerLeave={() => touchState.current.left = false}
                >
                  <ArrowLeft className="w-8 h-8 text-white/70" />
                </button>
                <button
                  className="w-16 h-16 rounded-full bg-black/40 border-2 border-white/20 flex items-center justify-center active:bg-white/20 active:border-neon-cyan backdrop-blur-md"
                  onPointerDown={() => touchState.current.right = true}
                  onPointerUp={() => touchState.current.right = false}
                  onPointerLeave={() => touchState.current.right = false}
                >
                  <ArrowRight className="w-8 h-8 text-white/70" />
                </button>
              </div>
              <div className="flex gap-4 pointer-events-auto">
                <button
                  className="w-16 h-16 rounded-full bg-black/40 border-2 border-white/20 flex items-center justify-center active:bg-neon-cyan/40 active:border-neon-cyan backdrop-blur-md shadow-[0_0_15px_rgba(0,255,255,0.2)]"
                  onPointerDown={() => touchState.current.thrust = true}
                  onPointerUp={() => touchState.current.thrust = false}
                  onPointerLeave={() => touchState.current.thrust = false}
                >
                  <ArrowUp className="w-8 h-8 text-neon-cyan" />
                </button>
                <button
                  className="w-16 h-16 rounded-full bg-black/40 border-2 border-white/20 flex items-center justify-center active:bg-neon-magenta/40 active:border-neon-magenta backdrop-blur-md shadow-[0_0_15px_rgba(255,0,255,0.2)]"
                  onPointerDown={() => touchState.current.shoot = true}
                  onPointerUp={() => touchState.current.shoot = false}
                  onPointerLeave={() => touchState.current.shoot = false}
                >
                  <Focus className="w-8 h-8 text-neon-magenta" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
