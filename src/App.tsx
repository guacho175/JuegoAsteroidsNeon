import { useEffect, useRef, useState } from 'react';

// --- Tipos del Motor ---
type Vector = { x: number; y: number };
type Particle = { p: Vector; v: Vector; life: number; maxLife: number; color: string };
type Projectile = { p: Vector; v: Vector; life: number; active: boolean };
type Asteroid = { p: Vector; v: Vector; radius: number; points: number[]; active: boolean; stage: number };
type Ship = { p: Vector; v: Vector; angle: number; radius: number; thrusting: boolean; active: boolean };

const SHOOT_DALAY = 15;
const FRICTION = 0.99;
const THRUST = 0.15;
const ROTATION_SPEED = 0.08;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [muted, setMuted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  
  const keys = useRef<{ [key: string]: boolean }>({});
  const touchState = useRef({ left: false, right: false, thrust: false, shoot: false });
  
  // Game state en refs para no disparar rerenders
  const state = useRef({
    score: 0,
    ship: { p: { x: 0, y: 0 }, v: { x: 0, y: 0 }, angle: -Math.PI / 2, radius: 15, thrusting: false, active: false } as Ship,
    asteroids: [] as Asteroid[],
    projectiles: [] as Projectile[],
    particles: [] as Particle[],
    w: 0,
    h: 0,
    shootCooldown: 0
  });

  // Init
  useEffect(() => {
    const saved = localStorage.getItem('asteroidsNeonHighScore');
    if (saved) setHighScore(parseInt(saved, 10));

    // Anti-Close System
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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

  const spawnAsteroid = (x: number, y: number, stage: number) => {
    const points = [];
    const numPoints = 8 + Math.random() * 4;
    for(let i=0; i<numPoints; i++) {
      points.push(Math.random() * 0.4 + 0.8); // Variance in asteroid shape
    }
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 1.5 + 0.5) * (stage === 3 ? 1 : stage === 2 ? 1.5 : 2);
    
    state.current.asteroids.push({
      p: { x, y },
      v: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      radius: stage === 3 ? 40 : stage === 2 ? 20 : 10,
      points,
      active: true,
      stage
    });
  };

  const spawnParticles = (p: Vector, color: string, count: number) => {
    for(let i=0; i<count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3;
        state.current.particles.push({
            p: { x: p.x, y: p.y },
            v: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
            life: 0,
            maxLife: 30 + Math.random() * 30,
            color
        });
    }
  };

  const startGame = () => {
    const s = state.current;
    if(canvasRef.current) {
        s.w = canvasRef.current.width = window.innerWidth;
        s.h = canvasRef.current.height = window.innerHeight;
    }
    s.score = 0;
    setScore(0);
    s.ship = { p: { x: s.w/2, y: s.h/2 }, v: { x: 0, y: 0 }, angle: -Math.PI / 2, radius: 15, thrusting: false, active: true };
    s.asteroids = [];
    s.projectiles = [];
    s.particles = [];
    s.shootCooldown = 0;
    
    // Spawn initials
    for(let i=0; i<5; i++) {
        spawnAsteroid(Math.random() * s.w, Math.random() * s.h, 3);
    }
    setGameOver(false);
  };

  // Motor Principal
  useEffect(() => {
    let afId: number;
    const s = state.current;
    
    const loop = () => {
      afId = requestAnimationFrame(loop);
      
      const canvas = canvasRef.current;
      if(!canvas) return;
      const ctx = canvas.getContext('2d');
      if(!ctx) return;
      
      // Resize check
      if(canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
          s.w = canvas.width = window.innerWidth;
          s.h = canvas.height = window.innerHeight;
      }

      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, s.w, s.h);

      if(gameOver || !s.ship.active) {
          return;
      }

      // 1. INPUT
      if(keys.current['ArrowLeft'] || touchState.current.left) s.ship.angle -= ROTATION_SPEED;
      if(keys.current['ArrowRight'] || touchState.current.right) s.ship.angle += ROTATION_SPEED;
      
      s.ship.thrusting = keys.current['ArrowUp'] || touchState.current.thrust;
      if(s.ship.thrusting) {
          s.ship.v.x += Math.cos(s.ship.angle) * THRUST;
          s.ship.v.y += Math.sin(s.ship.angle) * THRUST;
          spawnParticles({x: s.ship.p.x - Math.cos(s.ship.angle)*s.ship.radius, y: s.ship.p.y - Math.sin(s.ship.angle)*s.ship.radius}, '#00ffff', 1);
      }

      if((keys.current['Space'] || touchState.current.shoot) && s.shootCooldown <= 0) {
          s.projectiles.push({
              p: { x: s.ship.p.x + Math.cos(s.ship.angle) * s.ship.radius, y: s.ship.p.y + Math.sin(s.ship.angle) * s.ship.radius },
              v: { x: Math.cos(s.ship.angle) * 10, y: Math.sin(s.ship.angle) * 10 },
              life: 60,
              active: true
          });
          s.shootCooldown = SHOOT_DALAY;
          // Audio gen if not muted
      }
      if(s.shootCooldown > 0) s.shootCooldown--;

      // 2. FÍSICAS (Ship)
      s.ship.v.x *= FRICTION;
      s.ship.v.y *= FRICTION;
      s.ship.p.x += s.ship.v.x;
      s.ship.p.y += s.ship.v.y;
      
      // Wrap around
      if(s.ship.p.x < 0) s.ship.p.x = s.w; else if(s.ship.p.x > s.w) s.ship.p.x = 0;
      if(s.ship.p.y < 0) s.ship.p.y = s.h; else if(s.ship.p.y > s.h) s.ship.p.y = 0;

      // 3. FÍSICAS Entidades
      for(let p of s.projectiles) {
          p.p.x += p.v.x; p.p.y += p.v.y;
          p.life--;
          if(p.life <= 0) p.active = false;
          // wrap
          if(p.p.x < 0) p.p.x = s.w; else if(p.p.x > s.w) p.p.x = 0;
          if(p.p.y < 0) p.p.y = s.h; else if(p.p.y > s.h) p.p.y = 0;
      }
      s.projectiles = s.projectiles.filter(p => p.active);

      for(let a of s.asteroids) {
          a.p.x += a.v.x; a.p.y += a.v.y;
          if(a.p.x < -a.radius) a.p.x = s.w + a.radius; else if(a.p.x > s.w + a.radius) a.p.x = -a.radius;
          if(a.p.y < -a.radius) a.p.y = s.h + a.radius; else if(a.p.y > s.h + a.radius) a.p.y = -a.radius;
      }

      for(let pt of s.particles) {
          pt.p.x += pt.v.x; pt.p.y += pt.v.y;
          pt.life++;
      }
      s.particles = s.particles.filter(pt => pt.life < pt.maxLife);

      // Colisiones (Disparos vs Asteroides)
      for(let p of s.projectiles) {
          if(!p.active) continue;
          for(let a of s.asteroids) {
              if(!a.active) continue;
              const dx = p.p.x - a.p.x;
              const dy = p.p.y - a.p.y;
              if(dx*dx + dy*dy < a.radius*a.radius) {
                  p.active = false;
                  a.active = false;
                  s.score += (4 - a.stage) * 100;
                  setScore(s.score);
                  spawnParticles(a.p, '#ff00ff', 15);
                  if(a.stage > 1) {
                      spawnAsteroid(a.p.x, a.p.y, a.stage - 1);
                      spawnAsteroid(a.p.x, a.p.y, a.stage - 1);
                  }
                  break;
              }
          }
      }
      s.asteroids = s.asteroids.filter(a => a.active);

      // Update HighScore in loop occasionally
      if(s.score > highScore) {
          setHighScore(s.score);
          localStorage.setItem('asteroidsNeonHighScore', s.score.toString());
      }

      // Check Next Level Empty Condition
      if(s.asteroids.length === 0 && s.ship.active) {
          spawnAsteroid(Math.random() * s.w, -50, 3);
          spawnAsteroid(-50, Math.random() * s.h, 3);
          spawnAsteroid(Math.random() * s.w, s.h + 50, 3);
          spawnAsteroid(s.w + 50, Math.random() * s.h, 3);
      }

      // Colisiones (Nave vs Asteroides)
      for(let a of s.asteroids) {
          const dx = s.ship.p.x - a.p.x;
          const dy = s.ship.p.y - a.p.y;
          if(dx*dx + dy*dy < Math.pow(a.radius + s.ship.radius, 2)) {
              s.ship.active = false;
              spawnParticles(s.ship.p, '#00ffff', 50);
              setGameOver(true);
          }
      }

      // 4. DRAW
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      
      // Draw Ship
      if(s.ship.active) {
          ctx.strokeStyle = '#00ffff';
          ctx.shadowColor = '#00ffff';
          ctx.beginPath();
          ctx.moveTo(s.ship.p.x + Math.cos(s.ship.angle)*s.ship.radius, s.ship.p.y + Math.sin(s.ship.angle)*s.ship.radius);
          ctx.lineTo(s.ship.p.x + Math.cos(s.ship.angle + 2.5)*s.ship.radius, s.ship.p.y + Math.sin(s.ship.angle + 2.5)*s.ship.radius);
          ctx.lineTo(s.ship.p.x - Math.cos(s.ship.angle)*0, s.ship.p.y - Math.sin(s.ship.angle)*0);
          ctx.lineTo(s.ship.p.x + Math.cos(s.ship.angle - 2.5)*s.ship.radius, s.ship.p.y + Math.sin(s.ship.angle - 2.5)*s.ship.radius);
          ctx.closePath();
          ctx.stroke();
      }

      // Draw shots
      ctx.strokeStyle = '#fff';
      ctx.shadowColor = '#fff';
      for(let p of s.projectiles) {
          ctx.beginPath();
          ctx.moveTo(p.p.x, p.p.y);
          ctx.lineTo(p.p.x - p.v.x, p.p.y - p.v.y);
          ctx.stroke();
      }

      // Draw asteroids
      ctx.strokeStyle = '#ff00ff';
      ctx.shadowColor = '#ff00ff';
      for(let a of s.asteroids) {
          ctx.beginPath();
          for(let i=0; i<a.points.length; i++) {
              const ang = (i / a.points.length) * Math.PI * 2;
              const r = a.radius * a.points[i];
              const px = a.p.x + Math.cos(ang) * r;
              const py = a.p.y + Math.sin(ang) * r;
              if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
      }

      // Draw particles
      for(let pt of s.particles) {
          ctx.strokeStyle = pt.color;
          ctx.shadowColor = pt.color;
          ctx.globalAlpha = 1 - (pt.life / pt.maxLife);
          ctx.beginPath();
          ctx.arc(pt.p.x, pt.p.y, 1.5, 0, Math.PI*2);
          ctx.stroke();
          ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0; // reset
    };

    afId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(afId);
  }, [highScore, gameOver]);

  return (
    <div className="relative w-full h-full select-none">
      {/* HUD Superior */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center text-cyan-400 font-mono z-10 pointer-events-none">
        <div className="text-xl drop-shadow-[0_0_8px_rgba(0,255,255,0.8)]">SCORE: {score}</div>
        <div className="text-xl text-fuchsia-500 drop-shadow-[0_0_8px_rgba(255,0,255,0.8)] pointer-events-auto cursor-pointer" onClick={() => setMuted(!muted)}>
            {muted ? 'AUDIO: OFF' : 'AUDIO: ON'}
        </div>
        <div className="text-xl drop-shadow-[0_0_8px_rgba(0,255,255,0.8)]">HIGH: {highScore}</div>
      </div>

      <canvas ref={canvasRef} className="block" />

      {/* Intro / GameOver Overlay */}
      {(!state.current.ship.active || gameOver) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
              <h1 className="text-6xl text-fuchsia-500 font-bold mb-4 drop-shadow-[0_0_15px_rgba(255,0,255,1)] tracking-widest text-center">NEON<br/>ASTEROIDS</h1>
              {gameOver && <p className="text-cyan-400 text-2xl mb-8 drop-shadow-[0_0_10px_rgba(0,255,255,1)]">FINAL SCORE: {score}</p>}
              <button 
                onClick={startGame}
                className="px-8 py-3 bg-transparent border-2 border-cyan-400 text-cyan-400 font-bold text-xl hover:bg-cyan-400 hover:text-black transition-all shadow-[0_0_15px_rgba(0,255,255,0.5)]">
                  {gameOver ? 'REINICIAR' : 'INICIAR TRANSMISIÓN'}
              </button>
          </div>
      )}

      {/* Controles Híbridos (Móvil) */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between z-10 pointer-events-none sm:hidden">
        {/* Joystick Virtual / Direccion */}
        <div className="flex gap-4 pointer-events-auto">
            <button 
                className="w-16 h-16 rounded-full border border-cyan-500/50 bg-cyan-900/30 flex items-center justify-center text-cyan-400 active:bg-cyan-500/50 touch-none"
                onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId); touchState.current.left = true;}}
                onPointerUp={(e)=>{e.currentTarget.releasePointerCapture(e.pointerId); touchState.current.left = false;}}
                onPointerCancel={(e)=>{e.currentTarget.releasePointerCapture(e.pointerId); touchState.current.left = false;}}
            >
                ⟲
            </button>
            <button 
                className="w-16 h-16 rounded-full border border-cyan-500/50 bg-cyan-900/30 flex items-center justify-center text-cyan-400 active:bg-cyan-500/50 touch-none"
                onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId); touchState.current.right = true;}}
                onPointerUp={(e)=>{e.currentTarget.releasePointerCapture(e.pointerId); touchState.current.right = false;}}
                onPointerCancel={(e)=>{e.currentTarget.releasePointerCapture(e.pointerId); touchState.current.right = false;}}
            >
                ⟳
            </button>
        </div>
        {/* Acción */}
        <div className="flex gap-4 pointer-events-auto">
             <button 
                className="w-16 h-16 rounded-full border border-fuchsia-500/50 bg-fuchsia-900/30 flex items-center justify-center text-fuchsia-400 active:bg-fuchsia-500/50 touch-none"
                onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId); touchState.current.shoot = true;}}
                onPointerUp={(e)=>{e.currentTarget.releasePointerCapture(e.pointerId); touchState.current.shoot = false;}}
                onPointerCancel={(e)=>{e.currentTarget.releasePointerCapture(e.pointerId); touchState.current.shoot = false;}}
            >
                ◎
            </button>
            <button 
                className="w-16 h-16 rounded-full border border-cyan-500/50 bg-cyan-900/30 flex items-center justify-center text-cyan-400 active:bg-cyan-500/50 touch-none"
                onPointerDown={(e)=>{e.currentTarget.setPointerCapture(e.pointerId); touchState.current.thrust = true;}}
                onPointerUp={(e)=>{e.currentTarget.releasePointerCapture(e.pointerId); touchState.current.thrust = false;}}
                onPointerCancel={(e)=>{e.currentTarget.releasePointerCapture(e.pointerId); touchState.current.thrust = false;}}
            >
                △
            </button>
        </div>
      </div>
    </div>
  );
}