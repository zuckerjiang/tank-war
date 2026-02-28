/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point {
  x: number;
  y: number;
}

export enum EntityType {
  PLAYER = 'PLAYER',
  ENEMY_BASIC = 'ENEMY_BASIC',
  ENEMY_HEAVY = 'ENEMY_HEAVY',
}

export enum PowerUpType {
  EXTRA_LIFE = 'EXTRA_LIFE',
  RAPID_FIRE = 'RAPID_FIRE',
  TRIPLE_SHOT = 'TRIPLE_SHOT',
  FREEZE = 'FREEZE',
}

export interface GameState {
  score: number;
  level: number;
  lives: number;
  isGameOver: boolean;
  isPaused: boolean;
  gameStarted: boolean;
  winner: 'PLAYER' | 'ENEMY' | null;
  combo: number;
  comboTimer: number;
  screenShake: number;
  slowMotion: number;
  killstreak: number;
  retries: number;
}

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const TANK_SIZE = 40;
export const BULLET_SPEED = 7;
export const ENEMY_BULLET_SPEED = 4;
export const PLAYER_SPEED = 2.5;
export const ENEMY_SPEED = 0.8;
export const WALL_MAX_HEALTH = 20;
export const GRID_SIZE = 40;
export const BASE_SIZE = 60;
