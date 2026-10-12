import { CONFIG } from './Config.js';
import { clamp } from './Utils.js';

// Colisões em coordenadas locais da pista (s, d): muros, acostamentos e nave contra nave.
export class CollisionSystem {
  constructor(track) {
    this.track = track;
  }

  resolveBounds(ship) {
    const track = this.track;
    const E = CONFIG.energy;
    const hw = track.halfWidth;
    ship.grinding = false;
    if (ship.falling) {
      ship.onShoulder = false;
      return;
    }

    if (!track.hasWall(ship.s)) {
      // Trecho sem proteção: acostamento lento e, além dele, a queda (tratada em Ship).
      ship.onShoulder = Math.abs(ship.d) > hw - 0.4 && ship.grounded;
      return;
    }

    ship.onShoulder = false;
    const limit = ship.wallLimit;
    if (Math.abs(ship.d) <= limit) return;

    const side = Math.sign(ship.d);
    const lateral = (ship.v * Math.sin(ship.theta) + ship.slip * Math.cos(ship.theta)) * side;
    ship.d = side * limit;
    ship.grinding = true;
    if (lateral <= 0.5) return;

    // Empurra a nave de volta sem parar a corrida: realinha o rumo e devolve parte do impulso lateral.
    if (ship.theta * side > 0) ship.theta = -side * Math.min(0.1, Math.abs(ship.theta) * 0.3);
    ship.slip = -side * Math.min(lateral * 0.4, 13);
    ship.yawRate *= 0.3;
    ship.v *= 1 - clamp(lateral * 0.006, 0.01, 0.3);

    if (lateral > E.wallDamageThreshold) {
      const strong = lateral > E.strongImpact;
      ship.applyDamage((lateral - E.wallDamageThreshold) * E.wallDamageScale, strong);
    }
    if (ship.hitCooldown <= 0) {
      ship.hitCooldown = 0.18;
      // Raspar no muro (impacto lateral fraco) só solta faíscas; batidas de verdade sacodem a câmera.
      ship._emit(lateral < 9 ? 'wallGrind' : 'wallHit', clamp(lateral / 38, 0.12, 1), side);
    }
  }

  resolvePairs(ships) {
    const track = this.track;
    const E = CONFIG.energy;
    const LEN = CONFIG.ship.length;
    const WID = CONFIG.ship.width;

    for (let i = 0; i < ships.length; i++) {
      const a = ships[i];
      if (a.falling || a.ko) continue;
      for (let j = i + 1; j < ships.length; j++) {
        const b = ships[j];
        if (b.falling || b.ko) continue;
        const ds = track.delta(a.s, b.s);
        const absDs = Math.abs(ds);
        if (absDs >= LEN) continue;
        const dd = a.d - b.d;
        const absDd = Math.abs(dd);
        if (absDd >= WID || Math.abs(a.h - b.h) > 1.6) continue;

        const overlapS = LEN - absDs;
        const overlapD = WID - absDd;
        let intensity = 0;

        if (overlapD / WID < overlapS / LEN) {
          // Contato lateral: separa em d e troca impulso lateral.
          const dir = dd >= 0 ? 1 : -1;
          const va = a.v * Math.sin(a.theta) + a.slip;
          const vb = b.v * Math.sin(b.theta) + b.slip;
          const closing = (vb - va) * dir;
          a.d += dir * overlapD * 0.5;
          b.d -= dir * overlapD * 0.5;
          if (closing > 0) {
            const push = Math.min(closing * 0.55 + 2, 14);
            a.slip += dir * push;
            b.slip -= dir * push;
            a.theta *= 0.7;
            b.theta *= 0.7;
            a.v *= 0.985;
            b.v *= 0.985;
            intensity = clamp(closing / 26, 0.1, 1);
            if (closing > E.shipDamageThreshold) {
              const dmg = (closing - E.shipDamageThreshold) * E.shipDamageScale;
              a.applyDamage(dmg, closing > E.strongImpact);
              b.applyDamage(dmg, closing > E.strongImpact);
            }
          }
        } else {
          // Contato traseiro: quem vem atrás perde velocidade, quem está à frente ganha um empurrão.
          const front = ds > 0 ? a : b;
          const rear = ds > 0 ? b : a;
          const closing = rear.v - front.v;
          const shift = overlapS * 0.5;
          front.s = track.wrap(front.s + shift);
          front.frameDs += shift;
          rear.s = track.wrap(rear.s - shift);
          rear.frameDs -= shift;
          if (closing > 0) {
            const mid = (rear.v + front.v) * 0.5;
            rear.v = mid - closing * 0.15;
            front.v = mid + closing * 0.15;
            intensity = clamp(closing / 30, 0.1, 1);
            if (closing > E.shipDamageThreshold * 2) {
              const dmg = (closing - E.shipDamageThreshold * 2) * E.shipDamageScale * 0.6;
              rear.applyDamage(dmg, false);
              front.applyDamage(dmg * 0.5, false);
            }
          }
        }

        if (intensity > 0 && a.hitCooldown <= 0 && b.hitCooldown <= 0) {
          a.hitCooldown = 0.25;
          b.hitCooldown = 0.25;
          const side = dd >= 0 ? -1 : 1;
          a._emit('shipHit', intensity, side);
          b._emit('shipHit', intensity, -side);
        }
      }
    }
  }
}
