/**
 * MeleeSystem
 * 玩家近战攻击逻辑：
 * - 200ms 冷却
 * - 攻击时玩家向前小冲（25px 内有墙时不冲）
 * - 半径 100px 半圆范围（面朝方向 180°）覆盖头顶/脚下
 * - 命中判定 + 伤害分发（拟态矿 onHit、爆裂水晶 trigger、普通怪物 takeDamage）
 * - 播放 melee_attack 动画（如果 spritesheet 加载成功）
 * - 白色半圆视觉特效（保留方便测试）
 */
class MeleeSystem {
    constructor(scene) {
        this.scene = scene;
        this.DAMAGE = 3.5 / (window.AbyssDiff ? AbyssDiff.get().hpMul : 1);   // (用户) 难度: 输出除以血量倍率 = 怪物等效更肉
        this.RANGE = 100;       // 半径
        this.COOLDOWN = 200;    // ms
        this.ATTACK_DURATION = 150; // 动画时长 = isMeleeAttacking 时长
        this.FORWARD_SPEED = 30;    // 攻击向前推 (再减半)
        this.WALL_CHECK_DIST = 1;   // 检测面前 1px 内有墙才停止前冲（约靠近墙越好）
    }

    /** 在 target hitbox 最靠近玩家的点显示 melee_attack_slash 特效 */
    static playSlashEffect(scene, target, playerX, playerY) {
        if (!scene || !target || !scene.anims.exists('melee_attack_slash')) return;
        // 取 target hitbox
        let tLeft, tRight, tTop, tBottom;
        if (target.body) {
            tLeft = target.body.left;   tRight = target.body.right;
            tTop = target.body.top;     tBottom = target.body.bottom;
        } else if (target.rect && target.rect.body) {
            tLeft = target.rect.body.left; tRight = target.rect.body.right;
            tTop = target.rect.body.top;   tBottom = target.rect.body.bottom;
        } else {
            const w = (target.width  || target.displayWidth  || 32) / 2;
            const h = (target.height || target.displayHeight || 32) / 2;
            tLeft = target.x - w; tRight = target.x + w;
            tTop = target.y - h;  tBottom = target.y + h;
        }
        // 最靠近玩家的点（clamp 到 hitbox 矩形内）
        const slashX = Phaser.Math.Clamp(playerX, tLeft, tRight);
        const slashY = Phaser.Math.Clamp(playerY, tTop, tBottom);
        const slash = scene.add.sprite(slashX, slashY, 'melee_attack_slash');
        slash.setDepth(20);
        // 朝向：玩家在右 → flipX(true) 让 slash 朝左（朝玩家方向）
        const targetCenterX = (tLeft + tRight) / 2;
        slash.setFlipX(playerX > targetCenterX);
        slash.play('melee_attack_slash');
        slash.once('animationcomplete', () => slash.destroy());
        if (scene.uiCam) {
            try { scene.uiCam.ignore(slash); } catch(e) {}
        }
    }

    /** 玩家点左键时调用（已经过 paused / 持镐 等前置判断） */
    execute() {
        const s = this.scene;
        if (!s.player.body || s.isDead) return false;
        if (s.meleeCooldown > 0) return false;
        s.meleeCooldown = this.COOLDOWN;

        // 当前面朝方向（不转向）
        let facingRight = !s.player.flipX;

        s.isMeleeAttacking = true;
        s.meleeAttackFlipX = !facingRight;

        // 动画播放（切到 192 frame 同时立即调 offset 防止 body 跳位）
        if (s.anims.exists('melee_attack')) {
            s.player.play('melee_attack', true);
            // sprite frame 192 比 128 多 64，+32 offset 让 body 中心保持
            if (s.player.flipX) s.player.body.setOffset(88, 47);
            else                s.player.body.setOffset(72, 47);
        }
        s.time.delayedCall(this.ATTACK_DURATION, () => {
            s.isMeleeAttacking = false;
            if (s.player && s.player.body) {
                let onGround = s.player.body.blocked.down || s.player.body.touching.down;
                // 关键: 先切回 128px 动画 (idle/jump/fall), 再设 offset
                // 否则 sprite 还停在 192px melee_attack 帧, offset 用 128 的值 → body 左移 (空中攻击瞬移 bug)
                if (onGround) {
                    if (s.anims.exists('idle')) s.player.play('idle', true);
                } else {
                    const vy = s.player.body.velocity.y;
                    if (vy < -50 && s.anims.exists('jump')) s.player.play('jump', true);
                    else if (s.anims.exists('fall')) s.player.play('fall', true);
                }
                // 还原 offset 到 128 frame (此时 frame 已切回 128, 对齐)
                if (s.player.flipX) s.player.body.setOffset(56, 47);
                else                s.player.body.setOffset(40, 47);
            }
        });

        // 攻击时玩家小冲（贴墙不冲）
        this._forwardLunge(facingRight);

        // 半圆视觉特效
        this._drawArcEffect(facingRight);   // (用户) 临时恢复白色范围显示 — 调试跑位用, 确认后再注释

        // 命中判定 + 伤害
        this._swingHit = false;
        this._dealDamage(facingRight);
        // (用户) 挥稿音效: 命中 PickaxeHitThings / 挥空 PickaxeHitAir (共享系统 → 全场景生效)
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(s, this._swingHit ? 'PickaxeHitThings' : 'PickaxeHitAir', { volume: 0.5 });
        return true;
    }

    /** 攻击向前小冲（贴墙不冲, 空中不冲防漂移） */
    _forwardLunge(facingRight) {
        const s = this.scene;
        // 空中不 lunge — 否则没摩擦持续滑动, hitbox 飘走
        const onGround = s.player.body.blocked.down || s.player.body.touching.down;
        if (!onGround) return;

        let bx = s.player.body.x;
        let by = s.player.body.y;
        let bw = s.player.body.width;
        let bh = s.player.body.height;
        let stuck = false;
        if (s.wallRects) {
            let testRect = facingRight
                ? new Phaser.Geom.Rectangle(bx + bw, by + 4, this.WALL_CHECK_DIST, bh - 8)
                : new Phaser.Geom.Rectangle(bx - this.WALL_CHECK_DIST, by + 4, this.WALL_CHECK_DIST, bh - 8);
            for (let w of s.wallRects) {
                if (Phaser.Geom.Intersects.RectangleToRectangle(testRect, w)) { stuck = true; break; }
            }
        }
        if (!stuck) {
            s.player.body.setVelocityX(facingRight ? this.FORWARD_SPEED : -this.FORWARD_SPEED);
        }
    }

    /** 白色范围特效 — 跟命中判定完全一致: player.x 中心, 半径 RANGE 圆, 后方 BACK */
    _drawArcEffect(facingRight) {
        const s = this.scene;
        // 跟 _dealDamage 同一中心 (player.x/y, 稳定)
        const cx = s.player.x;
        const cy = s.player.y + 16;   // 整体下移 0.5 格 (对齐身体中心, 跟命中判定同源)
        const BACK = 40;  // 跟命中判定一致
        const VCAP = this.RANGE - 32;  // 上下各砍 1 格 (跟命中判定一致)

        // 整圆 graphics (半径 RANGE)
        let gfx = s.add.graphics();
        if (s.uiCam) s.uiCam.ignore(gfx);
        gfx.fillStyle(0xffffff, 0.45);
        gfx.fillCircle(cx, cy, this.RANGE);

        // mask: 前方 RANGE + 后方 BACK, 上下各限制 VCAP (裁掉后方 + 上下超出的部分)
        const maskGfx = s.make.graphics({ x: 0, y: 0, add: false });
        maskGfx.fillStyle(0xffffff, 1);
        const maskX = facingRight ? cx - BACK : cx - this.RANGE;
        const maskW = this.RANGE + BACK;
        maskGfx.fillRect(maskX, cy - VCAP, maskW, VCAP * 2);
        const mask = maskGfx.createGeometryMask();
        gfx.setMask(mask);

        s.tweens.add({
            targets: gfx,
            alpha: 0,
            duration: 150,
            onComplete: () => {
                gfx.clearMask(true);
                gfx.destroy();
                maskGfx.destroy();
            }
        });
    }

    /** 命中判定 + 伤害 — 半径 RANGE 圆, 后方 BACK (跟水晶判定 + 白色特效完全一致) */
    _dealDamage(facingRight) {
        const s = this.scene;
        // 用 sprite 中心 (player.x/y) — 稳定, 跟特效/水晶判定同源
        const cx = s.player.x;
        const cy = s.player.y + 16;   // 整体下移 0.5 格 (对齐身体中心, 跟白色显示同源)

        let allGroups = [s.spiders, s.bungeeSpiders, s.bats, s.earthworms,
                         s.slimes, s.miniSlimes, s.beetles, s.mimicOres,
                         s.cowardMimics, s.volatileCrystals];
        const RANGE_SQ = this.RANGE * this.RANGE;
        const BACK = 40;  // body 后边缘再 0.5 格
        const VCAP = this.RANGE - 32;  // 上下各砍 1 格 (32px)

        // 判定: 半径 RANGE 圆内, 上下各限制 VCAP, 后方限制 BACK
        const inMeleeRange = (mx, my) => {
            const dx = mx - cx, dy = my - cy;
            if (dx * dx + dy * dy > RANGE_SQ) return false;  // 圆外
            if (Math.abs(dy) > VCAP) return false;           // 上下各砍 1 格
            if (facingRight && dx < -BACK) return false;     // 后方超出 BACK
            if (!facingRight && dx > BACK) return false;
            return true;
        };

        allGroups.forEach(grp => {
            if (!grp) return;
            if (typeof grp.getChildren !== 'function') return;
            const children = grp.getChildren();
            if (!children || !Array.isArray(children)) return;
            children.forEach(m => {
                if (!m) return;
                if (m.hp === undefined || m.hp <= 0) return;
                if (!inMeleeRange(m.x, m.y)) return;

                let cn = m.constructor && m.constructor.name;
                let hit = false;
                if ((cn === 'MimicOre' || cn === 'CowardMimicOre') && m.state === 'disguised') {
                    m.onHit();
                    hit = true;
                } else if (cn === 'VolatileCrystal') {
                    m.takeDamage();
                    hit = true;
                } else {
                    m.takeDamage(this.DAMAGE, cx, cy);
                    hit = true;
                }
                if (hit) {
                    this._swingHit = true;
                    MeleeSystem.playSlashEffect(s, m, s.player.x, s.player.y);
                }
            });
        });

        // === Boss 命中检查 (scene._bosses 数组) ===
        if (s._bosses && Array.isArray(s._bosses)) {
            s._bosses.forEach(b => {
                if (!b || b.hp === undefined || b.hp <= 0) return;
                // Boss 主体 — 圆 + 40px 宽容 (boss 大), 同套后扩 BACK
                const bossRange = this.RANGE + 40;
                const dx = b.x - cx, dy = b.y - cy;
                if (dx * dx + dy * dy <= bossRange * bossRange &&
                    (facingRight ? dx >= -BACK : dx <= BACK)) {
                    if (typeof b.takeDamage === 'function') {
                        b.takeDamage(this.DAMAGE);
                        this._swingHit = true;
                        MeleeSystem.playSlashEffect(s, b, s.player.x, s.player.y);
                    }
                }
                // Boss 双手
                [b._handL, b._handR].forEach(hand => {
                    if (!hand || !hand.visible || hand._dead) return;
                    const hdx = hand.x - cx, hdy = hand.y - cy;
                    const handHalf = b._handHitboxHalf || 32;
                    const handRange = this.RANGE + handHalf;
                    if (hdx * hdx + hdy * hdy <= handRange * handRange &&
                        (facingRight ? hdx >= -BACK : hdx <= BACK)) {
                        if (typeof b.takeHandDamage === 'function') {
                            b.takeHandDamage(hand, this.DAMAGE);
                            this._swingHit = true;
                            MeleeSystem.playSlashEffect(s, hand, s.player.x, s.player.y);
                        }
                    }
                });
            });
        }

        // === BatNest 命中检查 (可破坏巢穴, scene._batNests; 近战够到的才打) ===
        if (s._batNests && Array.isArray(s._batNests)) {
            s._batNests.slice().forEach(n => {
                if (!n || n.hp === undefined || n.hp <= 0) return;
                if (!inMeleeRange(n.x, n.y)) return;
                if (typeof n.takeDamage === 'function') {
                    n.takeDamage(this.DAMAGE);
                    MeleeSystem.playSlashEffect(s, n, s.player.x, s.player.y);
                }
            });
        }
    }
}