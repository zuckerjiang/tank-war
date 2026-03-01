/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Heart, 
  Shield, 
  Trophy, 
  Gamepad2, 
  Info,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Zap
} from 'lucide-react';
import { 
  GameState, 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  TANK_SIZE, 
  EntityType, 
  BULLET_SPEED, 
  ENEMY_BULLET_SPEED,
  PLAYER_SPEED, 
  ENEMY_SPEED, 
  WALL_MAX_HEALTH,
  GRID_SIZE,
  BASE_SIZE,
  PowerUpType
} from './types';

// --- Game Logic Classes ---

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private isMuted: boolean = false;
  private musicInterval: any = null;

  constructor() {
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.2;

      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);
      this.musicGain.gain.value = 0.1;
    } catch (e) {
      console.warn('AudioContext not supported');
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playExplosion() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
    
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }

  playShoot() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playPowerUp() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  startMusic() {
    if (!this.ctx || !this.musicGain || this.musicInterval) return;
    
    let step = 0;
    const notes = [110, 110, 164, 110, 110, 110, 146, 110]; // Simple bass loop
    
    this.musicInterval = setInterval(() => {
      if (this.ctx && this.musicGain) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(notes[step % notes.length], this.ctx.currentTime);
        
        g.gain.setValueAtTime(0.1, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        
        osc.connect(g);
        g.connect(this.musicGain);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
        step++;
      }
    }, 200);
  }

  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }
}

const audioManager = new AudioManager();

class Bullet {
  x: number;
  y: number;
  angle: number;
  speed: number;
  owner: EntityType;
  active: boolean = true;
  power: number = 1;

  constructor(x: number, y: number, angle: number, owner: EntityType, power: number = 1) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = owner === EntityType.PLAYER ? BULLET_SPEED : ENEMY_BULLET_SPEED;
    this.owner = owner;
    this.power = power;
  }

  update() {
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;

    if (this.x < 0 || this.x > GAME_WIDTH || this.y < 0 || this.y > GAME_HEIGHT) {
      this.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    
    // Glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.owner === EntityType.PLAYER ? '#4ade80' : '#f87171';
    
    ctx.fillStyle = this.owner === EntityType.PLAYER ? '#4ade80' : '#f87171';
    ctx.beginPath();
    ctx.roundRect(-4, -2, 8, 4, 2);
    ctx.fill();
    
    ctx.restore();
  }
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  text?: string;

  constructor(x: number, y: number, color: string, text?: string) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.maxLife = Math.random() * 30 + 20;
    this.life = this.maxLife;
    this.color = color;
    this.size = Math.random() * 4 + 1;
    this.text = text;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    this.size *= 0.95;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = this.life / this.maxLife;
    if (this.text) {
      ctx.fillStyle = this.color;
      ctx.font = 'bold 24px font-display';
      ctx.textAlign = 'center';
      ctx.fillText(this.text, this.x, this.y);
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

class Wall {
  x: number;
  y: number;
  health: number = WALL_MAX_HEALTH;
  isBrick: boolean;

  constructor(x: number, y: number, isBrick: boolean = true) {
    this.x = x;
    this.y = y;
    this.isBrick = isBrick;
    if (!isBrick) this.health = 999999; // Indestructible
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.health <= 0) return;

    ctx.save();
    if (this.isBrick) {
      // Brick texture
      const opacity = this.health / WALL_MAX_HEALTH;
      ctx.fillStyle = `rgba(120, 53, 15, ${opacity})`;
      
      // Thinning logic: reduce width based on health
      const widthToShow = (this.health / WALL_MAX_HEALTH) * GRID_SIZE;
      const offsetX = (GRID_SIZE - widthToShow) / 2;
      
      ctx.fillRect(this.x + offsetX, this.y, widthToShow, GRID_SIZE);
      
      // Brick lines (subtle)
      ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.2})`;
      ctx.lineWidth = 0.5;
      
      // Draw some vertical lines to show "thinning"
      ctx.strokeRect(this.x + offsetX, this.y, widthToShow, GRID_SIZE);
    } else {
      // Steel wall
      ctx.fillStyle = '#475569';
      ctx.fillRect(this.x, this.y, GRID_SIZE, GRID_SIZE);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x + 4, this.y + 4, GRID_SIZE - 8, GRID_SIZE - 8);
      
      // Rivets
      ctx.fillStyle = '#cbd5e1';
      [6, GRID_SIZE - 6].forEach(px => {
        [6, GRID_SIZE - 6].forEach(py => {
          ctx.beginPath();
          ctx.arc(this.x + px, this.y + py, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }
    ctx.restore();
  }

  getCollisionRect() {
    if (!this.isBrick) return { x: this.x, y: this.y, w: GRID_SIZE, h: GRID_SIZE };
    
    const widthToShow = (this.health / WALL_MAX_HEALTH) * GRID_SIZE;
    const offsetX = (GRID_SIZE - widthToShow) / 2;
    return { 
      x: this.x + offsetX, 
      y: this.y, 
      w: widthToShow, 
      h: GRID_SIZE 
    };
  }
}

class MudPit {
  x: number;
  y: number;
  size: number = GRID_SIZE * 2;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    
    // Mud texture
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.size / 2, this.size / 3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Bubbles/detail
    ctx.fillStyle = '#78350f';
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(Math.sin(Date.now() * 0.001 + i) * 10, Math.cos(Date.now() * 0.0015 + i) * 5, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
  }

  getCollisionCircle() {
    return { x: this.x, y: this.y, r: this.size / 2.5 };
  }
}

class PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  active: boolean = true;
  pulse: number = 0;

  constructor(x: number, y: number, type: PowerUpType) {
    this.x = x;
    this.y = y;
    this.type = type;
  }

  update() {
    this.pulse += 0.1;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const scale = 1 + Math.sin(this.pulse) * 0.1;
    ctx.scale(scale, scale);

    // Glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.getColor();
    
    ctx.fillStyle = this.getColor();
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.getIcon(), 0, 0);

    ctx.restore();
  }

  getColor() {
    switch (this.type) {
      case PowerUpType.EXTRA_LIFE: return '#ef4444';
      case PowerUpType.RAPID_FIRE: return '#eab308';
      case PowerUpType.TRIPLE_SHOT: return '#10b981';
      case PowerUpType.FREEZE: return '#0ea5e9';
    }
  }

  getIcon() {
    switch (this.type) {
      case PowerUpType.EXTRA_LIFE: return 'H';
      case PowerUpType.RAPID_FIRE: return 'F';
      case PowerUpType.TRIPLE_SHOT: return 'T';
      case PowerUpType.FREEZE: return 'Z';
    }
  }
}

class Tank {
  x: number;
  y: number;
  angle: number = 0;
  type: EntityType;
  health: number = 1;
  maxHealth: number = 1;
  speed: number;
  cooldown: number = 0;
  invulnerable: number = 0;
  stunned: number = 0;
  mudImmunity: number = 0;
  hasShield: boolean = false;
  tripleShotTimer: number = 0;
  rapidFireTimer: number = 0;
  color: string;
  heldPowerUp: PowerUpType | null = null;

  constructor(x: number, y: number, type: EntityType) {
    this.x = x;
    this.y = y;
    this.type = type;
    
    if (type === EntityType.PLAYER) {
      this.speed = PLAYER_SPEED;
      this.color = '#4ade80';
      this.health = 1;
    } else if (type === EntityType.ENEMY_HEAVY) {
      this.speed = ENEMY_SPEED * 0.7;
      this.color = '#7c3aed';
      this.health = 3;
      this.maxHealth = 3;
    } else {
      this.speed = ENEMY_SPEED;
      this.color = '#f87171';
      this.health = 1;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.invulnerable > 0 && Math.floor(Date.now() / 100) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    
    // Stun effect
    if (this.stunned > 0) {
      ctx.translate(Math.sin(Date.now() * 0.1) * 2, 0);
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 20;
    } else {
      ctx.shadowBlur = 15;
      ctx.shadowColor = this.color;
    }

    ctx.rotate(this.angle);

    // Realistic Tank Body
    const width = TANK_SIZE;
    const height = TANK_SIZE * 0.8;

    // Treads
    ctx.fillStyle = '#334155';
    ctx.fillRect(-width / 2, -height / 2 - 2, width, 6); // Top tread
    ctx.fillRect(-width / 2, height / 2 - 4, width, 6); // Bottom tread

    // Main Body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.roundRect(-width / 2 + 2, -height / 2, width - 4, height, 4);
    ctx.fill();

    // Detail lines on body
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-width / 2 + 6, -height / 2 + 4, width - 12, height - 8);

    // Turret
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(-2, 0, height / 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.stroke();

    // Cannon
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, -3, width / 2 + 8, 6);
    
    // Muzzle brake
    ctx.fillRect(width / 2 + 5, -4, 4, 8);

    // Shield
    if (this.hasShield) {
      ctx.restore();
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, TANK_SIZE * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#3b82f6';
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
    }

    ctx.restore();
  }

  move(dx: number, dy: number, walls: Wall[]) {
    const nextX = this.x + dx * this.speed;
    const nextY = this.y + dy * this.speed;

    // Boundary check
    if (nextX < TANK_SIZE / 2 || nextX > GAME_WIDTH - TANK_SIZE / 2 ||
        nextY < TANK_SIZE / 2 || nextY > GAME_HEIGHT - TANK_SIZE / 2) {
      return false;
    }

    // Wall collision
    for (const wall of walls) {
      if (wall.health <= 0) continue;
      const rect = wall.getCollisionRect();
      if (nextX + TANK_SIZE / 2 > rect.x && nextX - TANK_SIZE / 2 < rect.x + rect.w &&
          nextY + TANK_SIZE / 2 > rect.y && nextY - TANK_SIZE / 2 < rect.y + rect.h) {
        return false;
      }
    }

    this.x = nextX;
    this.y = nextY;
    if (dx !== 0 || dy !== 0) {
      this.angle = Math.atan2(dy, dx);
    }
    return true;
  }
}

class Base {
  x: number;
  y: number;
  owner: EntityType;
  hasShield: boolean = true;
  health: number = 3;
  maxHealth: number = 3;
  color: string;

  constructor(x: number, y: number, owner: EntityType) {
    this.x = x;
    this.y = y;
    this.owner = owner;
    this.color = owner === EntityType.PLAYER ? '#4ade80' : '#f87171';
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // Base Body
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-BASE_SIZE / 2, -BASE_SIZE / 2, BASE_SIZE, BASE_SIZE);
    
    // Health Bar
    const healthWidth = (this.health / this.maxHealth) * BASE_SIZE;
    ctx.fillStyle = this.color;
    ctx.fillRect(-BASE_SIZE / 2, BASE_SIZE / 2 + 5, healthWidth, 4);

    // Icon
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(15, 15);
    ctx.lineTo(-15, 15);
    ctx.closePath();
    ctx.fill();

    // Shield
    if (this.hasShield) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, BASE_SIZE * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#3b82f6';
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
    }

    ctx.restore();
  }

  getCollisionRect() {
    return { 
      x: this.x - BASE_SIZE / 2, 
      y: this.y - BASE_SIZE / 2, 
      w: BASE_SIZE, 
      h: BASE_SIZE 
    };
  }
}

enum BarrelType {
  NORMAL = 'NORMAL',
  NUKE = 'NUKE',
}

class Barrel {
  x: number;
  y: number;
  active: boolean = true;
  health: number;
  type: BarrelType;

  constructor(x: number, y: number, type: BarrelType = BarrelType.NORMAL) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.health = type === BarrelType.NUKE ? 5 : 3;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    
    // Barrel body
    ctx.fillStyle = this.type === BarrelType.NUKE ? '#1e1b4b' : '#b91c1c';
    ctx.beginPath();
    ctx.roundRect(-15, -20, 30, 40, 4);
    ctx.fill();
    
    // Stripes
    ctx.strokeStyle = this.type === BarrelType.NUKE ? '#4ade80' : '#450a0a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-15, -10); ctx.lineTo(15, -10);
    ctx.moveTo(-15, 10); ctx.lineTo(15, 10);
    ctx.stroke();
    
    // Label
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.type === BarrelType.NUKE ? 'NUKE' : 'TNT', 0, 4);
    
    // Glow for Nuke
    if (this.type === BarrelType.NUKE) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#4ade80';
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1;
      ctx.strokeRect(-16, -21, 32, 42);
    }
    
    ctx.restore();
  }

  getCollisionRect() {
    return { x: this.x - 15, y: this.y - 20, w: 30, h: 40 };
  }
}

// --- Main Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    level: 1,
    lives: 3,
    isGameOver: false,
    isPaused: false,
    gameStarted: false,
    winner: null,
    combo: 0,
    comboTimer: 0,
    screenShake: 0,
    slowMotion: 0,
    killstreak: 0,
  });

  // Game Engine Refs
  const playerRef = useRef<Tank | null>(null);
  const enemiesRef = useRef<Tank[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const wallsRef = useRef<Wall[]>([]);
  const barrelsRef = useRef<Barrel[]>([]);
  const mudPitsRef = useRef<MudPit[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const playerBaseRef = useRef<Base | null>(null);
  const enemyBaseRef = useRef<Base | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const requestRef = useRef<number>(0);
  const gameStateRef = useRef<GameState>(gameState);
  const freezeTimerRef = useRef<number>(0);
  const joystickRef = useRef({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const isMobileRef = useRef(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      const mobile = 'ontouchstart' in window || 
                    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || 
                    window.innerWidth < 1024;
      setIsMobile(mobile);
      isMobileRef.current = mobile;
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync ref with state
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const triggerBarrelExplosion = (barrel: Barrel) => {
    if (!barrel.active) return;
    barrel.active = false;
    
    const isNuke = barrel.type === BarrelType.NUKE;
    const radius = isNuke ? 300 : 150;
    const color = isNuke ? '#4ade80' : '#f97316';
    const text = isNuke ? 'NUCLEAR!' : 'BOOM!';
    
    createExplosion(barrel.x, barrel.y, color, isNuke ? 100 : 50);
    audioManager.playExplosion();
    setGameState(prev => ({ 
      ...prev, 
      screenShake: isNuke ? 40 : 15,
      slowMotion: isNuke ? 60 : prev.slowMotion 
    }));
    
    particlesRef.current.push(new Particle(barrel.x, barrel.y, color, text));
    
    // Shrapnel
    const bulletCount = isNuke ? 16 : 8;
    for (let i = 0; i < bulletCount; i++) {
      const angle = (i / bulletCount) * Math.PI * 2;
      bulletsRef.current.push(new Bullet(
        barrel.x + Math.cos(angle) * 20,
        barrel.y + Math.sin(angle) * 20,
        angle,
        EntityType.PLAYER // Shrapnel counts as player damage for combos
      ));
    }

    // Chain Reaction & Stun
    barrelsRef.current.forEach(other => {
      if (other === barrel || !other.active) return;
      const dist = Math.hypot(other.x - barrel.x, other.y - barrel.y);
      if (dist < radius) {
        other.health -= isNuke ? 5 : 1;
        if (other.health <= 0) setTimeout(() => triggerBarrelExplosion(other), 100);
      }
    });

    enemiesRef.current.forEach(enemy => {
      const dist = Math.hypot(enemy.x - barrel.x, enemy.y - barrel.y);
      if (dist < radius) {
        enemy.stunned = isNuke ? 300 : 180;
        createExplosion(enemy.x, enemy.y, '#fff', 5);
        particlesRef.current.push(new Particle(enemy.x, enemy.y - 20, '#fff', isNuke ? 'VAPORIZED!' : 'STUNNED!'));
      }
    });
  };

  const initLevel = useCallback((level: number) => {
    // Reset entities
    bulletsRef.current = [];
    particlesRef.current = [];
    powerUpsRef.current = [];
    barrelsRef.current = [];
    mudPitsRef.current = [];
    freezeTimerRef.current = 0;
    
    // Create Bases
    playerBaseRef.current = new Base(GAME_WIDTH / 2, GAME_HEIGHT - 40, EntityType.PLAYER);
    enemyBaseRef.current = new Base(GAME_WIDTH / 2, 40, EntityType.ENEMY_BASIC);

    // Create Player
    if (!playerRef.current) {
      playerRef.current = new Tank(GAME_WIDTH / 2 - 60, GAME_HEIGHT - 100, EntityType.PLAYER);
    } else {
      playerRef.current.x = GAME_WIDTH / 2 - 60;
      playerRef.current.y = GAME_HEIGHT - 100;
      playerRef.current.angle = -Math.PI / 2;
      playerRef.current.tripleShotTimer = 0;
      playerRef.current.rapidFireTimer = 0;
      playerRef.current.stunned = 0;
      playerRef.current.invulnerable = 0;
    }

    // Create Walls (Randomized)
    const walls: Wall[] = [];
    // Protect bases with some walls
    for (let i = -1; i <= 1; i++) {
      if (i === 0) continue;
      walls.push(new Wall(GAME_WIDTH / 2 + i * GRID_SIZE, GAME_HEIGHT - 80));
      walls.push(new Wall(GAME_WIDTH / 2 + i * GRID_SIZE, 80));
    }

    // Randomized walls
    const wallCount = 15 + level * 2;
    for (let i = 0; i < wallCount; i++) {
      const x = Math.floor(Math.random() * (GAME_WIDTH / GRID_SIZE)) * GRID_SIZE;
      const y = Math.floor(Math.random() * ((GAME_HEIGHT - 200) / GRID_SIZE)) * GRID_SIZE + 100;
      
      // Avoid base areas
      if (Math.abs(x - GAME_WIDTH / 2) < 100 && (y < 150 || y > GAME_HEIGHT - 150)) continue;
      
      const isBrick = Math.random() < 0.7;
      walls.push(new Wall(x, y, isBrick));
    }
    wallsRef.current = walls;

    // Create Mud Pits
    const mudPitCount = 3 + Math.floor(level / 2);
    for (let i = 0; i < mudPitCount; i++) {
        const x = Math.random() * (GAME_WIDTH - 200) + 100;
        const y = Math.random() * (GAME_HEIGHT - 300) + 150;
        mudPitsRef.current.push(new MudPit(x, y));
    }

    // Create Barrels
    barrelsRef.current = [
      new Barrel(150, GAME_HEIGHT / 2),
      new Barrel(GAME_WIDTH - 150, GAME_HEIGHT / 2),
      new Barrel(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100),
    ];
    
    if (level % 3 === 0) {
      barrelsRef.current.push(new Barrel(GAME_WIDTH / 2, GAME_HEIGHT / 2, BarrelType.NUKE));
    }

    // Create Enemies
    const enemyCount = Math.min(10, level + 1);
    const enemies: Tank[] = [];
    const powerUpTypes = [PowerUpType.EXTRA_LIFE, PowerUpType.RAPID_FIRE, PowerUpType.TRIPLE_SHOT, PowerUpType.FREEZE];
    
    for (let i = 0; i < enemyCount; i++) {
      const isHeavy = level >= 3 && Math.random() < 0.2 + (level * 0.05);
      const type = isHeavy ? EntityType.ENEMY_HEAVY : EntityType.ENEMY_BASIC;
      const x = Math.random() * (GAME_WIDTH - 100) + 50;
      const y = Math.random() * 200 + 50;
      const enemy = new Tank(x, y, type);
      
      // Every enemy carries a tool
      enemy.heldPowerUp = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
      enemies.push(enemy);
    }
    enemiesRef.current = enemies;
  }, []);

  const startGame = () => {
    audioManager.resume();
    audioManager.startMusic();
    const newState: GameState = {
      score: 0,
      level: 1,
      lives: 5,
      isGameOver: false,
      isPaused: false,
      gameStarted: true,
      winner: null,
      combo: 0,
      comboTimer: 0,
      screenShake: 0,
      slowMotion: 0,
      killstreak: 0,
      retries: 5,
    };
    setGameState(newState);
    gameStateRef.current = newState;
    playerRef.current = null;
    initLevel(1);
  };

  const restartLevel = () => {
    audioManager.resume();
    if (gameState.retries > 0) {
      const currentLevel = gameState.level;
      const newState: GameState = {
        ...gameState,
        lives: 5,
        isGameOver: false,
        isPaused: false,
        gameStarted: true,
        winner: null,
        combo: 0,
        comboTimer: 0,
        retries: gameState.retries - 1
      };
      setGameState(newState);
      gameStateRef.current = newState;
      initLevel(currentLevel);
    }
  };

  const createExplosion = (x: number, y: number, color: string, count: number = 15) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push(new Particle(x, y, color));
    }
    for (let i = 0; i < 5; i++) {
      particlesRef.current.push(new Particle(x, y, '#f59e0b'));
    }
  };

  const handleShoot = (tank: Tank) => {
    if (tank.cooldown > 0 || tank.stunned > 0) return;
    
    const shoot = (angleOffset: number = 0) => {
      const power = (tank.type === EntityType.PLAYER && tank.rapidFireTimer > 0) ? 2 : 1;
      const bullet = new Bullet(
        tank.x + Math.cos(tank.angle + angleOffset) * (TANK_SIZE / 2 + 10),
        tank.y + Math.sin(tank.angle + angleOffset) * (TANK_SIZE / 2 + 10),
        tank.angle + angleOffset,
        tank.type === EntityType.PLAYER ? EntityType.PLAYER : EntityType.ENEMY_BASIC,
        power
      );
      bulletsRef.current.push(bullet);
    };

    shoot();
    audioManager.playShoot();
    if (tank.type === EntityType.PLAYER) {
      setGameState(prev => ({ ...prev, screenShake: Math.max(prev.screenShake, 2) }));
      if (tank.tripleShotTimer > 0) {
        shoot(-0.2);
        shoot(0.2);
      }
      tank.cooldown = tank.rapidFireTimer > 0 ? 10 : 45;
    } else {
      tank.cooldown = 45;
    }
  };

  const update = () => {
    const state = gameStateRef.current;
    if (state.isPaused || state.isGameOver || !state.gameStarted) {
      audioManager.stopMusic();
      return;
    }
    audioManager.startMusic();

    const player = playerRef.current;
    if (!player) return;

    // Update Timers
    if (freezeTimerRef.current > 0) freezeTimerRef.current--;
    if (player.tripleShotTimer > 0) player.tripleShotTimer--;
    if (player.rapidFireTimer > 0) player.rapidFireTimer--;
    
    // Slow Motion Logic
    if (state.slowMotion > 0) {
      if (Math.floor(Date.now() / 16) % 3 !== 0) {
        setGameState(prev => ({ ...prev, slowMotion: prev.slowMotion - 1 }));
        requestRef.current = requestAnimationFrame(update);
        return;
      }
      setGameState(prev => ({ ...prev, slowMotion: prev.slowMotion - 1 }));
    }

    setGameState(prev => {
      const nextShake = Math.max(0, prev.screenShake * 0.9);
      const nextComboTimer = Math.max(0, prev.comboTimer - 1);
      const nextCombo = nextComboTimer === 0 ? 0 : prev.combo;
      const nextKillstreak = nextCombo === 0 ? 0 : prev.killstreak;
      return { ...prev, screenShake: nextShake, comboTimer: nextComboTimer, combo: nextCombo, killstreak: nextKillstreak };
    });

    // Player Input
    let dx = 0, dy = 0;
    if (player.stunned <= 0) {
      // Keyboard Input
      if (keysRef.current.has('ArrowUp') || keysRef.current.has('w')) dy -= 1;
      if (keysRef.current.has('ArrowDown') || keysRef.current.has('s')) dy += 1;
      if (keysRef.current.has('ArrowLeft') || keysRef.current.has('a')) dx -= 1;
      if (keysRef.current.has('ArrowRight') || keysRef.current.has('d')) dx += 1;
      
      // Joystick Input (Mobile)
      if (joystickRef.current.x !== 0 || joystickRef.current.y !== 0) {
        dx = joystickRef.current.x;
        dy = joystickRef.current.y;
      }

      if (dx !== 0 || dy !== 0) {
        const mag = Math.sqrt(dx * dx + dy * dy);
        player.move(dx / mag, dy / mag, wallsRef.current);
        
        // Update angle based on movement if not auto-firing
        if (!isMobile) {
            player.angle = Math.atan2(dy, dx);
        }
      }

      // Shooting Logic
      // Auto-fire enabled for everyone as requested
      if (player.cooldown <= 0) {
        handleShoot(player);
      }
      
      // Manual fire still works for extra burst or if auto-fire is preferred with space
      if (!isMobileRef.current && (keysRef.current.has(' ') || keysRef.current.has('Spacebar'))) {
        handleShoot(player);
      }
    } else {
      player.stunned--;
    }

    if (player.cooldown > 0) player.cooldown--;
    if (player.invulnerable > 0) player.invulnerable--;
    if (player.mudImmunity > 0) player.mudImmunity--;
    
    enemiesRef.current.forEach(enemy => {
      if (enemy.mudImmunity > 0) enemy.mudImmunity--;
    });

    // Mud Pit Collision
    mudPitsRef.current.forEach(pit => {
      const circle = pit.getCollisionCircle();
      
      // Player vs Mud
      if (player.stunned <= 0 && player.mudImmunity <= 0) {
        const dist = Math.hypot(player.x - circle.x, player.y - circle.y);
        if (dist < circle.r) {
          player.stunned = 180; // 3 seconds
          player.mudImmunity = 420; // 7 seconds immunity (3s stunned + 4s to escape)
          particlesRef.current.push(new Particle(player.x, player.y - 20, '#451a03', 'STUCK!'));
        }
      }

      // Enemies vs Mud
      enemiesRef.current.forEach(enemy => {
        if (enemy.stunned <= 0 && enemy.mudImmunity <= 0) {
          const dist = Math.hypot(enemy.x - circle.x, enemy.y - circle.y);
          if (dist < circle.r) {
            enemy.stunned = 180;
            enemy.mudImmunity = 600; // 10 seconds total (3s stunned + 7s to escape)
            particlesRef.current.push(new Particle(enemy.x, enemy.y - 20, '#451a03', 'STUCK!'));
          }
        }
      });
    });

    // Update Bullets
    bulletsRef.current.forEach((bullet, index) => {
      bullet.update();

      // Bullet vs Bullet collision
      if (bullet.active && bullet.owner === EntityType.PLAYER) {
        for (let j = 0; j < bulletsRef.current.length; j++) {
          const other = bulletsRef.current[j];
          if (other.active && other.owner !== EntityType.PLAYER) {
            const dist = Math.hypot(bullet.x - other.x, bullet.y - other.y);
            if (dist < 10) {
              bullet.active = false;
              other.active = false;
              createExplosion(bullet.x, bullet.y, '#fff', 5);
              break;
            }
          }
        }
      }

      if (!bullet.active) return;

      // Bullet vs Walls
      for (const wall of wallsRef.current) {
        if (wall.health <= 0) continue;
        const rect = wall.getCollisionRect();
        if (bullet.x > rect.x && bullet.x < rect.x + rect.w &&
            bullet.y > rect.y && bullet.y < rect.y + rect.h) {
          bullet.active = false;
          if (wall.isBrick) {
            wall.health -= bullet.power;
            createExplosion(bullet.x, bullet.y, '#78350f', 3);
            audioManager.playExplosion();
          }
          break;
        }
      }

      if (!bullet.active) return;

      // Bullet vs Barrels
      for (const barrel of barrelsRef.current) {
        if (!barrel.active) continue;
        const rect = barrel.getCollisionRect();
        if (bullet.x > rect.x && bullet.x < rect.x + rect.w &&
            bullet.y > rect.y && bullet.y < rect.y + rect.h) {
          bullet.active = false;
          barrel.health -= bullet.power;
          if (barrel.health <= 0) {
            triggerBarrelExplosion(barrel);
          }
        }
      }

      if (!bullet.active) return;

      // Bullet vs Bases
      [playerBaseRef.current, enemyBaseRef.current].forEach(base => {
        if (!base || !bullet.active) return;
        
        const isOpponent = (base.owner === EntityType.PLAYER && bullet.owner !== EntityType.PLAYER) ||
                          (base.owner !== EntityType.PLAYER && bullet.owner === EntityType.PLAYER);
        
        if (!isOpponent) return;

        const rect = base.getCollisionRect();
        if (bullet.x > rect.x && bullet.x < rect.x + rect.w &&
            bullet.y > rect.y && bullet.y < rect.y + rect.h) {
          bullet.active = false;
          if (base.hasShield) {
            base.hasShield = false;
            createExplosion(bullet.x, bullet.y, '#3b82f6', 10);
            audioManager.playExplosion();
            setGameState(prev => ({ ...prev, screenShake: 5 }));
          } else {
            base.health -= bullet.power;
            createExplosion(bullet.x, bullet.y, base.color, 15);
            audioManager.playExplosion();
            setGameState(prev => ({ ...prev, screenShake: 8 }));
            
            if (base.health <= 0) {
              createExplosion(base.x, base.y, base.color, 50);
              if (base.owner === EntityType.PLAYER) {
                setGameState(prev => ({ 
                  ...prev, 
                  isGameOver: true, 
                  screenShake: 20,
                  winner: 'ENEMY' 
                }));
              } else {
                // Enemy base destroyed, next level
                setGameState(prev => {
                  const nextLevel = prev.level + 1;
                  initLevel(nextLevel);
                  return { ...prev, level: nextLevel, screenShake: 15, score: prev.score + 1000 };
                });
              }
            }
          }
        }
      });

      if (!bullet.active) return;

      // Bullet vs Player
      if (bullet.active && bullet.owner !== EntityType.PLAYER && player.invulnerable <= 0) {
        const dist = Math.hypot(bullet.x - player.x, bullet.y - player.y);
        if (dist < TANK_SIZE / 2) {
          bullet.active = false;
          if (player.hasShield) {
            player.hasShield = false;
            player.invulnerable = 60;
          } else {
            player.invulnerable = 120;
            player.stunned = 30;
            createExplosion(player.x, player.y, player.color, 30);
            audioManager.playExplosion();
            setGameState(prev => {
              const newLives = prev.lives - 1;
              if (newLives <= 0) {
                return { ...prev, lives: 0, isGameOver: true, winner: 'ENEMY', screenShake: 15 };
              }
              return { ...prev, lives: newLives, screenShake: 8 };
            });
          }
        }
      }

      if (!bullet.active) return;

      // Bullet vs Enemies
      if (bullet.active && bullet.owner === EntityType.PLAYER) {
        enemiesRef.current.forEach((enemy) => {
          const dist = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y);
          if (dist < TANK_SIZE / 2) {
            bullet.active = false;
            enemy.health -= bullet.power;
            audioManager.playExplosion();
            
            if (enemy.health <= 0) {
              createExplosion(enemy.x, enemy.y, enemy.color, 30);
              
              // Drop held power-up 100% of the time
              if (enemy.heldPowerUp) {
                powerUpsRef.current.push(new PowerUp(enemy.x, enemy.y, enemy.heldPowerUp));
              }
              
              setGameState(prev => {
                const newCombo = prev.combo + 1;
                const bonus = 100 * newCombo;
                const newKillstreak = prev.killstreak + 1;
                
                let slowMo = prev.slowMotion;
                if (newKillstreak % 10 === 0) {
                  slowMo = 30;
                  const streakTexts = ['UNSTOPPABLE!', 'GODLIKE!', 'RAMPAGE!', 'DOMINATING!'];
                  const text = streakTexts[Math.floor(Math.random() * streakTexts.length)];
                  particlesRef.current.push(new Particle(player.x, player.y - 40, '#f87171', text));
                }

                return { 
                  ...prev, 
                  score: prev.score + bonus,
                  combo: newCombo,
                  comboTimer: 120,
                  screenShake: 5,
                  killstreak: newKillstreak,
                  slowMotion: slowMo
                };
              });
            } else {
              enemy.stunned = 45;
              createExplosion(bullet.x, bullet.y, enemy.color, 10);
            }
          }
        });
      }
    });
    bulletsRef.current = bulletsRef.current.filter(b => b.active);
    barrelsRef.current = barrelsRef.current.filter(b => b.active);
    enemiesRef.current = enemiesRef.current.filter(e => e.health > 0);

    // Update Enemies
    enemiesRef.current.forEach(enemy => {
      if (freezeTimerRef.current > 0) return;
      if (enemy.stunned > 0) {
        enemy.stunned--;
        return;
      }

      const targetPlayer = Math.random() < 0.6; // 60% chance to target player
      
      if (Math.random() < 0.03) {
        let targetX = player.x;
        let targetY = player.y;

        if (!targetPlayer && playerBaseRef.current) {
          targetX = playerBaseRef.current.x;
          targetY = playerBaseRef.current.y;
        }

        enemy.angle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
      }
      
      const dx = Math.cos(enemy.angle);
      const dy = Math.sin(enemy.angle);
      if (!enemy.move(dx, dy, wallsRef.current)) {
        enemy.angle += (Math.random() - 0.5) * Math.PI;
      }

      if (enemy.cooldown > 0) enemy.cooldown--;
      
      const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const angleDiff = Math.abs(enemy.angle - angleToPlayer);
      if (angleDiff < 0.2 && Math.random() < 0.05) {
        handleShoot(enemy);
      } else if (Math.random() < 0.005) {
        handleShoot(enemy);
      }
    });

    // Update PowerUps
    powerUpsRef.current.forEach((pu) => {
      pu.update();
      const dist = Math.hypot(pu.x - player.x, pu.y - player.y);
      if (dist < TANK_SIZE) {
        pu.active = false;
        createExplosion(pu.x, pu.y, pu.getColor(), 20);
        audioManager.playPowerUp();
        if (pu.type === PowerUpType.EXTRA_LIFE) setGameState(prev => ({ ...prev, lives: prev.lives + 1 }));
        if (pu.type === PowerUpType.RAPID_FIRE) player.rapidFireTimer = 600;
        if (pu.type === PowerUpType.TRIPLE_SHOT) player.tripleShotTimer = 600;
        if (pu.type === PowerUpType.FREEZE) {
          freezeTimerRef.current = 480; // 8 seconds
          enemiesRef.current.forEach(enemy => {
            particlesRef.current.push(new Particle(enemy.x, enemy.y - 20, '#0ea5e9', 'FROZEN!'));
          });
        }
      }
    });
    powerUpsRef.current = powerUpsRef.current.filter(pu => pu.active);

    // Update Particles
    particlesRef.current.forEach(p => p.update());
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    // Level Progression based on enemy clear
    if (enemiesRef.current.length === 0 && state.gameStarted && !state.isGameOver) {
      setGameState(prev => {
        const nextLevel = prev.level + 1;
        initLevel(nextLevel);
        return { ...prev, level: nextLevel, screenShake: 10 };
      });
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const shakeX = (Math.random() - 0.5) * gameStateRef.current.screenShake;
    const shakeY = (Math.random() - 0.5) * gameStateRef.current.screenShake;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    ctx.clearRect(-20, -20, GAME_WIDTH + 40, GAME_HEIGHT + 40);
    ctx.fillStyle = '#14532d';
    ctx.fillRect(-20, -20, GAME_WIDTH + 40, GAME_HEIGHT + 40);
    
    ctx.fillStyle = '#166534';
    for (let i = 0; i < GAME_WIDTH; i += 100) {
      for (let j = 0; j < GAME_HEIGHT; j += 100) {
        if ((i + j) % 200 === 0) {
          ctx.beginPath();
          ctx.ellipse(i + 50, j + 50, 40, 20, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    mudPitsRef.current.forEach(pit => pit.draw(ctx));
    wallsRef.current.forEach(wall => wall.draw(ctx));
    barrelsRef.current.forEach(barrel => barrel.draw(ctx));
    if (playerBaseRef.current) playerBaseRef.current.draw(ctx);
    if (enemyBaseRef.current) enemyBaseRef.current.draw(ctx);
    powerUpsRef.current.forEach(pu => pu.draw(ctx));
    bulletsRef.current.forEach(bullet => bullet.draw(ctx));
    if (playerRef.current) playerRef.current.draw(ctx);
    enemiesRef.current.forEach(enemy => enemy.draw(ctx));
    particlesRef.current.forEach(p => p.draw(ctx));

    // Combo Popup
    if (gameStateRef.current.combo > 1) {
      ctx.save();
      ctx.translate(GAME_WIDTH / 2, 120);
      ctx.font = 'bold 40px font-display';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#fbbf24';
      ctx.globalAlpha = Math.min(1, gameStateRef.current.comboTimer / 60);
      ctx.fillText(`COMBO x${gameStateRef.current.combo}`, 0, 0);
      ctx.restore();
    }

    // Freeze Overlay
    if (freezeTimerRef.current > 0) {
      ctx.fillStyle = 'rgba(186, 230, 253, 0.2)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // Slow Motion Effect
    if (gameStateRef.current.slowMotion > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 20;
      ctx.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    ctx.restore();

    if (gameStateRef.current.isPaused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
  }, []);

  useEffect(() => {
    const gameLoop = () => {
      const state = gameStateRef.current;
      if (state.gameStarted && !state.isPaused && !state.isGameOver) {
        update();
      }
      draw();
      requestRef.current = requestAnimationFrame(gameLoop);
    };

    if (gameState.gameStarted) {
      requestRef.current = requestAnimationFrame(gameLoop);
    }

    return () => cancelAnimationFrame(requestRef.current);
  }, [gameState.gameStarted, draw]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key.toLowerCase() === 'p') {
        setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }));
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-zinc-950 font-sans selection:bg-emerald-500/30">
      <div className="scanline"></div>
      
      {/* HUD */}
      <AnimatePresence>
        {gameState.gameStarted && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-[800px] flex items-center justify-between mb-4 px-6 py-3 glass rounded-2xl z-20"
          >
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-mono">Score</span>
                <span className="text-xl font-bold font-display text-emerald-400">{gameState.score.toLocaleString()}</span>
              </div>
              <div className="h-8 w-px bg-white/10"></div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-mono">Combo</span>
                <span className={`text-xl font-bold font-display transition-all ${gameState.combo > 0 ? 'text-amber-400 scale-110' : 'text-zinc-600'}`}>
                  x{gameState.combo}
                </span>
              </div>
              <div className="h-8 w-px bg-white/10"></div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-mono">Level</span>
                <span className="text-xl font-bold font-display text-white">{gameState.level}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {gameState.slowMotion > 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 px-3 py-1 bg-amber-500/20 border border-amber-500/40 rounded-full"
                >
                  <Zap className="w-3 h-3 text-amber-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-tighter">Slow-Mo</span>
                </motion.div>
              )}
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-mono">Retries</span>
                <span className="text-xs font-bold text-white">{gameState.retries}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-mono">Lives</span>
                <div className="flex gap-1">
                  {Array.from({ length: gameState.lives }).map((_, i) => (
                    <Heart key={i} className="w-4 h-4 text-rose-500 fill-rose-500" />
                  ))}
                </div>
              </div>
              <button 
                onClick={() => setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }))}
                className="p-3 hover:bg-white/10 rounded-full transition-colors bg-white/5"
              >
                {gameState.isPaused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex flex-col lg:flex-row gap-6 items-start">
        {/* Game Canvas Container */}
        <div className="relative glass p-1 rounded-3xl overflow-hidden shadow-2xl shadow-emerald-500/10">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="rounded-2xl cursor-crosshair bg-zinc-900 w-full max-w-[800px] aspect-[4/3]"
          />

          {/* Overlay Screens */}
          <AnimatePresence>
            {isMobile && gameState.gameStarted && !gameState.isGameOver && !gameState.isPaused && (
              <div className="absolute inset-0 z-50 pointer-events-none">
                {/* Joystick */}
                <div className="absolute bottom-6 left-6 w-20 h-20 bg-white/5 backdrop-blur-sm rounded-full border border-white/10 flex items-center justify-center touch-none pointer-events-auto opacity-40">
                  <motion.div
                    drag
                    dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    dragElastic={0.5}
                    onDrag={(_, info) => {
                      const x = Math.max(-1, Math.min(1, info.offset.x / 25));
                      const y = Math.max(-1, Math.min(1, info.offset.y / 25));
                      joystickRef.current = { x, y };
                    }}
                    onDragEnd={() => {
                      joystickRef.current = { x: 0, y: 0 };
                    }}
                    className="w-6 h-6 bg-emerald-500/60 rounded-full shadow-lg shadow-emerald-500/10 cursor-grab active:cursor-grabbing"
                  />
                </div>
                {/* Shoot Button */}
                <button
                  onTouchStart={() => keysRef.current.add(' ')}
                  onTouchEnd={() => keysRef.current.delete(' ')}
                  className="absolute bottom-6 right-6 w-16 h-16 bg-rose-500/5 backdrop-blur-sm rounded-full border border-rose-500/10 flex items-center justify-center touch-none pointer-events-auto active:bg-rose-500/20 transition-colors opacity-40"
                >
                  <Zap className="w-6 h-6 text-rose-500/60" />
                </button>
              </div>
            )}

            {!gameState.gameStarted && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-8 text-center"
              >
                <motion.div
                  initial={{ y: 20 }}
                  animate={{ y: 0 }}
                  className="mb-8"
                >
                  <h1 className="text-6xl font-black font-display tracking-tighter text-white mb-2">
                    TANK <span className="text-emerald-500">BATTLE</span>
                  </h1>
                  <p className="text-zinc-400 max-w-md mx-auto">
                    精英坦克指挥官，准备好迎接挑战了吗？摧毁敌方单位，升级你的装备，在战场上生存下来。
                  </p>
                </motion.div>

                <button 
                  onClick={startGame}
                  className="group relative px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                >
                  <span className="flex items-center gap-2">
                    <Play className="w-5 h-5 fill-current" />
                    开始作战
                  </span>
                </button>

                <div className="mt-12 grid grid-cols-3 gap-8 text-zinc-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-3 bg-white/5 rounded-xl"><Gamepad2 className="w-6 h-6" /></div>
                    <span className="text-xs font-mono uppercase tracking-tighter">{isMobile ? '摇杆控制' : 'WASD 控制'}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-3 bg-white/5 rounded-xl"><Zap className="w-6 h-6" /></div>
                    <span className="text-xs font-mono uppercase tracking-tighter">{isMobile ? '自动射击' : '空格 射击'}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-3 bg-white/5 rounded-xl"><Shield className="w-6 h-6" /></div>
                    <span className="text-xs font-mono uppercase tracking-tighter">{isMobile ? '点击暂停' : 'P 暂停'}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {gameState.isPaused && !gameState.isGameOver && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md"
              >
                <h2 className="text-4xl font-bold font-display text-white mb-8">战事暂停</h2>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setGameState(prev => ({ ...prev, isPaused: false }))}
                    className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all"
                  >
                    继续战斗
                  </button>
                  <button 
                    onClick={() => setGameState(prev => ({ ...prev, gameStarted: false, isPaused: false }))}
                    className="px-6 py-3 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-all"
                  >
                    退出游戏
                  </button>
                </div>
              </motion.div>
            )}

            {gameState.isGameOver && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-xl p-8 ${gameState.winner === 'PLAYER' ? 'bg-emerald-950/90' : 'bg-rose-950/90'}`}
              >
                {gameState.winner === 'PLAYER' ? (
                  <Trophy className="w-20 h-20 text-yellow-500 mb-6 drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]" />
                ) : (
                  <Heart className="w-20 h-20 text-rose-500 mb-6 opacity-20" />
                )}
                
                <h2 className="text-5xl font-black font-display text-white mb-2">
                  {gameState.winner === 'PLAYER' ? '任务完成' : '任务失败'}
                </h2>
                <p className="text-white/60 mb-8">
                  {gameState.winner === 'PLAYER' ? '你成功摧毁了敌方基地！' : '你的基地已被摧毁！'}
                </p>
                
                <div className="glass-dark p-6 rounded-2xl mb-8 w-full max-w-xs">
                  <div className="flex justify-between mb-2">
                    <span className="text-white/40 uppercase text-[10px] tracking-widest">最终得分</span>
                    <span className="text-xl font-bold font-mono">{gameState.score.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40 uppercase text-[10px] tracking-widest">最高关卡</span>
                    <span className="text-xl font-bold font-mono">{gameState.level}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-4 w-full max-w-xs">
                  <button 
                    onClick={restartLevel}
                    disabled={gameState.retries <= 0}
                    className={`flex items-center justify-center gap-2 px-8 py-4 bg-white text-black font-bold rounded-2xl hover:scale-105 transition-all shadow-xl w-full ${gameState.retries <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <RotateCcw className="w-5 h-5" />
                    重试当前关卡 ({gameState.retries})
                  </button>
                  <button 
                    onClick={startGame}
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/20 transition-all border border-white/20 w-full"
                  >
                    <RotateCcw className="w-5 h-5" />
                    从第一关开始
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar / Instructions */}
        <div className="w-full lg:w-72 flex flex-col gap-6">
          <div className="glass p-6 rounded-3xl">
            <div className="flex items-center gap-2 mb-4 text-emerald-400">
              <Info className="w-5 h-5" />
              <h3 className="font-bold font-display uppercase tracking-wider text-sm">情报中心</h3>
            </div>
            
            <div className="space-y-4">
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_8px_#3b82f6]"></div>
                  <span className="text-xs font-bold text-zinc-300">基地 (Base)</span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">核心目标。自带一层护盾，护盾消失后需承受三发子弹才会被摧毁。</p>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 bg-emerald-400 rounded-full shadow-[0_0_8px_#4ade80]"></div>
                  <span className="text-xs font-bold text-zinc-300">坦克对战</span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">每关增加一辆敌军（最多10辆）。所有敌军都携带工具，击毁后必定掉落！</p>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 bg-amber-800 rounded-sm"></div>
                  <span className="text-xs font-bold text-zinc-300">砖块墙</span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">可被摧毁。20次命中完全消失，10次后可透视边缘。</p>
              </div>
            </div>
          </div>

          <div className="glass p-6 rounded-3xl">
            <div className="flex items-center gap-2 mb-4 text-blue-400">
              <Zap className="w-5 h-5" />
              <h3 className="font-bold font-display uppercase tracking-wider text-sm">补给工具</h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center gap-3 p-2 bg-sky-500/10 rounded-xl border border-sky-500/20">
                <Info className="w-5 h-5 text-sky-400" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-sky-400 uppercase">冷冻 (Freeze)</span>
                  <span className="text-[8px] text-zinc-500">使其他坦克停止移动 8 秒</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <Zap className="w-5 h-5 text-emerald-400" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase">三连射 (Triple)</span>
                  <span className="text-[8px] text-zinc-500">发射扇形三枚子弹</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                <Zap className="w-5 h-5 text-amber-400" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-amber-400 uppercase">极速 (Rapid)</span>
                  <span className="text-[8px] text-zinc-500">大幅提升装弹速度</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <Heart className="w-5 h-5 text-rose-400" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-rose-400 uppercase">生命 (Life)</span>
                  <span className="text-[8px] text-zinc-500">增加坦克生命值</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Controls */}
      <div className="mt-8 lg:hidden grid grid-cols-2 gap-8 w-full max-w-md">
        <div className="grid grid-cols-3 gap-2">
          <div />
          <button className="p-4 glass rounded-2xl active:bg-white/20 touch-none" onPointerDown={() => keysRef.current.add('ArrowUp')} onPointerUp={() => keysRef.current.delete('ArrowUp')}><ChevronUp /></button>
          <div />
          <button className="p-4 glass rounded-2xl active:bg-white/20 touch-none" onPointerDown={() => keysRef.current.add('ArrowLeft')} onPointerUp={() => keysRef.current.delete('ArrowLeft')}><ChevronLeft /></button>
          <button className="p-4 glass rounded-2xl active:bg-white/20 touch-none" onPointerDown={() => keysRef.current.add('ArrowDown')} onPointerUp={() => keysRef.current.delete('ArrowDown')}><ChevronDown /></button>
          <button className="p-4 glass rounded-2xl active:bg-white/20 touch-none" onPointerDown={() => keysRef.current.add('ArrowRight')} onPointerUp={() => keysRef.current.delete('ArrowRight')}><ChevronRight /></button>
        </div>
        <div className="flex items-center justify-center">
          <button 
            className="w-24 h-24 bg-emerald-500/20 border-4 border-emerald-500/50 rounded-full flex items-center justify-center active:scale-90 transition-transform touch-none"
            onPointerDown={() => keysRef.current.add(' ')}
            onPointerUp={() => keysRef.current.delete(' ')}
          >
            <Zap className="w-10 h-10 text-emerald-400" />
          </button>
        </div>
      </div>

      <footer className="mt-12 text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-mono">
        &copy; 2024 TANK BATTLE COMMAND &bull; ALL RIGHTS RESERVED
      </footer>
    </div>
  );
}
