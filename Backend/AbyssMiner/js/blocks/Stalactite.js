/**
 * BatBoss — SafeZone4 boss (300 血, 无重力, 不攻击时在房间里漂浮乱飞)
 *
 * 技能 (每个最多连续随机到 3 次就必须换; 一套技能做完后冷却):
 *   一阶段 (满血→半血), 冷却 3s:
 *     25% WIND  — 空中停留 2s → 本体中心释放 3 圈冲击波 (1/秒, 10格/秒外扩),
 *                 撞到玩家往后吹 2 格(走路速度), 顶着走可当场抵消 (纯控制)
 *     50% DASH  — 飞到玩家 y → 蓄力 0.75s → 左/右冲刺 (参考 Golem 横扫, x距离3~5格,
 *                 该侧有墙换边, 两边都堵就跳过), 撞到玩家 18 伤害
 *     25% ROAR  — 咆哮 2s + 震动 2s → 1s 后天花板掉 5~8 颗钟乳石 (必有一颗砸玩家当前x,
 *                 红色弹道提示), 砸中 15 伤害
 *   半血后, 冷却 2.5s:
 *     每隔 10~25s 强制来一整套 WIND
 *     60% DASH (蓄力 0.6s, 冲刺更快), 40% ROAR (7~11 颗钟乳石)
 *
 * 天花板范围: 用 options.ceilingTop / options.groundY (做好 SZ4 场景后传精确值);
 *            默认用 arena 上下边界, 所以现在也能跑.
 *
 * 用法 (SZ4 做好后):
 *   const bat = new BatBoss(scene, x, y, {
 *       arena: { x1: ..px, y1: ..px, x2: ..px, y2: ..px },   // 漂浮/冲刺范围
 *       ceilingTop: ..px, groundY: ..px                       // 钟乳石天花板/地面
 *   });
 *   scene._bosses = scene._bosses || []; scene._bosses.push(bat);  // update 由 _bosses 驱动
 *   // 攻击命中走 bat.takeDamage(dmg) (跟 Golem 同)
 *   // 场景 update 里需驱动钟乳石: (scene._stalactites||[]).forEach(s => s.update());
 */
class BatBoss {
    constructor(scene, x, y, options = {}) {
        this.scene = scene;
        const G = 32;

        // ---- 属性 ----
        this.hp = 200;      // (用户) Easy 基准 300→200 (难度倍率走全局输出÷hpMul)
        this.maxHp = 200;
        this.dead = false;
        this._phase2 = false;

        // ---- 范围配置 (没给就用世界边界) ----
        const wb = (scene.physics && scene.physics.world && scene.physics.world.bounds) || { x: 0, y: 0, width: 1280, height: 720 };
        this.arena = options.arena || { x1: wb.x + 32, y1: wb.y + 32, x2: wb.x + wb.width - 32, y2: wb.y + wb.height - 32 };
        this.ceilingTop = options.ceilingTop != null ? options.ceilingTop : this.arena.y1;
        this.groundY = options.groundY != null ? options.groundY : this.arena.y2;

        // ---- 常量 ----
        this.WANDER_SPEED = options.wanderSpeed || 130;
        this.DASH_SPEED   = 900;     // 一阶段冲刺速度 (参考 Golem 横扫)
        this.DASH_SPEED2  = 1200;    // 半血冲刺速度 (参考 Golem 半血横扫)
        this.FLOOR_Y      = 14 * 32; // (用户) 活动下限: 不飞到 y=14 行及以下
        this.MOVEY_SPEED  = 320;     // 飞到玩家 y 的速度
        this.RING_SPEED   = 10 * G;  // 冲击波外扩 10 格/秒
        this.WALK_SPEED   = 450;     // 玩家走路速度 (击退用)
        this.DASH_DMG     = 18;
        this.STAL_DMG     = 15;
        this.SHAKE_INTENSITY = 0.003;
        // dash 大改: 像小蝙蝠那样靠近到 ATTACK_RANGE 就停下蓄力再冲 (范围 = 小蝙蝠 120 的 2 倍)
        this.ATTACK_RANGE = 240;
        this.APPROACH_SPEED = 300;   // 朝玩家靠近的速度
        this.DASH_CORRIDOR_R = 36;   // 冲刺走廊半宽 (≈boss 可见身体半径) — 通路够这个宽 boss 才不蹭墙角(甲沟炎); 可调

        // ---- sprite (无重力) — (用户) 优先 Bat_boss 专属皮肤 (144×112), 缺图回退小蝙蝠放大 ----
        if (scene.textures.exists('Bat_boss_fly')) {
            this.sprite = scene.add.sprite(x, y, 'Bat_boss_fly').setDepth(20);
            this.sprite.setScale(1.0);   // 原生 144×112
            BatBoss._registerAnims(scene);
            if (scene.anims.exists('bat_boss_fly')) this.sprite.play('bat_boss_fly');
        } else if (scene.textures.exists('Bat_fly')) {
            this.sprite = scene.add.sprite(x, y, 'Bat_fly').setDepth(20);
            this.sprite.setScale(3.0);          // 32px → ~96px (放大当 boss)
            if (scene.anims && scene.anims.exists('bat_fly')) this.sprite.play('bat_fly');  // 播小蝙蝠飞行动画
        } else if (scene.textures.exists('BatBoss')) {
            this.sprite = scene.add.sprite(x, y, 'BatBoss').setDepth(20);
        } else {
            // fallback: 大号深紫蝙蝠椭圆
            this.sprite = scene.add.ellipse(x, y, 88, 44, 0x3a1f4a, 1).setStrokeStyle(3, 0x7733aa).setDepth(20);
        }
        scene.physics.add.existing(this.sprite);
        if (this.sprite.body) {
            this.sprite.body.setAllowGravity(false);
            // 八边形 hitbox: Arcade 物理只支持矩形/圆, 用圆形近似 (削掉方形四角, 更贴蝙蝠轮廓); 半径可调
            if (this.sprite.texture && this.sprite.texture.key === 'Bat_boss_fly') {
                this.sprite.body.setCircle(38, 34, 18);   // (用户) 144×112 帧内居中圆 r=38 (可按贴图调)
            } else if (this.sprite.texture && this.sprite.texture.key === 'Bat_fly') {
                this.sprite.body.setCircle(13, 3, 3);   // 半径 13 (帧 px) × scale → ~39px 世界半径, 居中
            } else {
                this.sprite.body.setSize(60, 60);  // = Golem hitbox (fallback)
            }
            this.sprite.body.setCollideWorldBounds(true);
        }
        if (scene.walls) { try { scene.physics.add.collider(this.sprite, scene.walls); } catch (e) {} }
        if (scene.uiCam) { try { scene.uiCam.ignore(this.sprite); } catch (e) {} }

        // ---- 血条 ----
        const BW = 120;
        this._hpBg  = scene.add.rectangle(x - BW / 2, y - 60, BW, 8, 0x000000, 0.6).setOrigin(0, 0.5).setDepth(21);
        this._hpBar = scene.add.rectangle(x - BW / 2, y - 60, BW, 8, 0xcc3344, 1).setOrigin(0, 0.5).setDepth(21);
        this._hpBarW = BW;
        if (scene.uiCam) { try { scene.uiCam.ignore([this._hpBg, this._hpBar]); } catch (e) {} }

        // ---- 状态机 ----
        this.state = 'idle';
        this._t = 0;                 // 当前 state 已过 ms
        this._cooldownDur = 1200;    // 开场短冷却
        this._lastSkill = null;
        this._sameCount = 0;
        this._windTimer = Phaser.Math.Between(3000, 10000);  // 半血 WIND 计时 ((用户) 上下限各 -8s)

        // wander
        this._wanderTarget = this._randomArenaPoint();

        // 技能临时态
        this._rings = [];
        this._ringsSpawned = 0;
        this._ringTick = 0;
        this._windPushUntil = 0;
        this._dashDir = 1;
        this._dashHit = false;
        this._dashStartX = 0;
        this._dashMaxTravel = 0;
    }

    // ───────── 工具 ─────────
    get x() { return this.sprite ? this.sprite.x : 0; }
    get y() { return this.sprite ? this.sprite.y : 0; }

    _randomArenaPoint() {
        const FY = this.FLOOR_Y || (14 * 32);
        const px = Phaser.Math.Between(this.arena.x1 + 30, this.arena.x2 - 30);
        let py = Phaser.Math.Between(this.arena.y1 + 30, Math.min(this.arena.y2 - 30, this.arena.y1 + (this.arena.y2 - this.arena.y1) * 0.6));
        py = Math.min(py, FY - 8);   // (用户) 硬下限: 漂浮目标不选 y=14 行及以下
        // (用户) 软梯度: 距下限 <5 格时, 越贴近 y=14 往下选的概率越低 (落选则翻到上方)
        const distFloor = FY - this.y;
        if (py > this.y && distFloor < 5 * 32) {
            const pDown = Math.max(0, distFloor / (5 * 32));
            if (Math.random() > pDown) py = Math.max(this.arena.y1 + 30, this.y - Math.abs(py - this.y) * 0.6);
        }
        return { x: px, y: py };
    }

    _setState(s) {
        this.state = s; this._t = 0;
        // (用户) Bat_boss 皮肤按状态切动画: dash_go=冲刺图; roar/roar_wait/wind_rings=咆哮图循环
        //        (召唤钟乳石的整个咆哮阶段 + 释放冲击波都配 Bat_boss_roar, 退出回 fly)
        const sp = this.sprite;
        if (sp && sp.play && sp.anims) {
            BatBoss._registerAnims(this.scene);   // 幂等兜底 (构造时缺图也能事后自愈)
            const A = this.scene.anims;
            sp.off('animationcomplete-bat_boss_roar');   // 清旧链, 防 once 堆积
            const ROAR_STATES = ['roar', 'roar_wait', 'wind_rings'];
            if (s === 'dash_go' && A.exists('bat_boss_dash')) {
                sp.play('bat_boss_dash', true);
            } else if (ROAR_STATES.includes(s) && A.exists('bat_boss_roar')) {
                const replay = () => {
                    if (!sp.active) return;
                    if (ROAR_STATES.includes(this.state)) {
                        sp.play('bat_boss_roar');
                        sp.once('animationcomplete-bat_boss_roar', replay);
                    } else if (A.exists('bat_boss_fly')) {
                        sp.play('bat_boss_fly', true);
                    }
                };
                if (!sp.anims.currentAnim || sp.anims.currentAnim.key !== 'bat_boss_roar' || !sp.anims.isPlaying) {
                    sp.play('bat_boss_roar', true);
                }
                sp.once('animationcomplete-bat_boss_roar', replay);
            } else if (!ROAR_STATES.includes(s) && A.exists('bat_boss_fly')) {
                if (!sp.anims.currentAnim || sp.anims.currentAnim.key !== 'bat_boss_fly') sp.play('bat_boss_fly', true);
            }
        }
    }

    _vel(vx, vy) { if (this.sprite && this.sprite.body) this.sprite.body.setVelocity(vx, vy); }

    _faceTowards(px) { if (this.sprite) this.sprite.flipX = (px >= this.sprite.x); }

    // ───────── 主循环 ─────────
    update(time, delta, player) {
        if (this.dead) return;
        const p = player || this.scene.player;
        if (!p || !p.body) return;
        const dt = delta / 1000;
        this._t += delta;

        // ====== (用户) HP 自动恢复: 跟 Golem 同款, 每 10 秒 +1 (满血不补; 离场期间累积, 回来一次性补齐) ======
        if (this._lastRegenTime === undefined) this._lastRegenTime = time;
        const elapsedRegen = time - this._lastRegenTime;
        if (elapsedRegen >= 10000) {
            const ticks = Math.floor(elapsedRegen / 10000);
            if (!this.dead && this.hp > 0 && this.hp < this.maxHp) {
                this.hp = Math.min(this.maxHp, this.hp + ticks);
            }
            this._lastRegenTime += ticks * 10000;
        }

        // 血条跟随 + 缩放
        if (this._hpBar) {
            this._hpBg.setPosition(this.x - this._hpBarW / 2, this.y - 60);
            this._hpBar.setPosition(this.x - this._hpBarW / 2, this.y - 60);
            this._hpBar.scaleX = Math.max(0, this.hp / this.maxHp);
        }

        // 半血切换
        if (!this._phase2 && this.hp <= this.maxHp / 2) {
            this._phase2 = true;
            this._windTimer = Phaser.Math.Between(3000, 10000);
        }
        if (this._phase2 && (this.state === 'idle')) this._windTimer -= delta;

        switch (this.state) {
            case 'idle':       this._updateIdle(dt, p); break;
            case 'wind_hover': this._updateWindHover(dt, p); break;
            case 'wind_rings': this._updateWindRings(dt, time, p); break;
            case 'dash_approach': this._updateDashApproach(dt, p); break;
            case 'dash_charge':this._updateDashCharge(dt, p); break;
            case 'dash_go':    this._updateDashGo(dt, p); break;
            case 'roar':       this._updateRoar(dt, p); break;
            case 'roar_wait':  this._updateRoarWait(dt, p); break;
        }

        // (用户) y=14 行硬下限: 任何状态越界立即顶回, 向下速度清零; 冲刺越界则立即结束冲刺
        const FYU = this.FLOOR_Y || (14 * 32);
        if (this.sprite && this.sprite.y >= FYU) {
            this.sprite.y = FYU - 1;
            const bv = this.sprite.body && this.sprite.body.velocity;
            if (bv && bv.y > 0) bv.y = 0;
            if (this.state === 'dash_go') { this._vel(0, 0); this._enterCooldown(); }
        }

        // 风击退窗口结束 → 清除
        if (this.scene._windKnockVx && time > this._windPushUntil) this.scene._windKnockVx = 0;
    }

    // ── idle: 漂浮 + 冷却到点选技能 ──
    _updateIdle(dt, p) {
        this._wander(dt);
        if (this._attackEnabled === false) return;  // 玩家未进 boss 房镜头 → 只漂浮巡逻, 不出招
        if (this._t >= this._cooldownDur) {
            this._startSkill(this._pickSkill());
        }
    }

    _wander(dt) {
        this._wanderT = (this._wanderT || 0) + dt * 1000;
        const tgt = this._wanderTarget;
        const dx = tgt.x - this.x, dy = tgt.y - this.y;
        const d = Math.hypot(dx, dy);
        // 到达 或 撞墙 或 卡住超过 2.5s → 换新目标 (撞墙立刻换角度移动)
        const wb = this.sprite && this.sprite.body && this.sprite.body.blocked;
        const wBlocked = wb && (wb.left || wb.right || wb.up || wb.down);
        if (d < 24 || wBlocked || this._wanderT > 2500) {
            this._wanderTarget = this._randomArenaPoint();
            this._wanderT = 0;
            this._vel(0, 0);
            return;
        }
        this._vel((dx / d) * this.WANDER_SPEED, (dy / d) * this.WANDER_SPEED);
        this._faceTowards(this.scene.player ? this.scene.player.x : this.x);
    }

    _pickSkill() {
        let skill;
        if (this._phase2) {
            if (this._windTimer <= 0) { this._windTimer = Phaser.Math.Between(3000, 10000); return 'wind'; }
            skill = (Math.random() < 0.6) ? 'dash' : 'roar';
        } else {
            const r = Math.random();
            skill = r < 0.25 ? 'wind' : (r < 0.75 ? 'dash' : 'roar');
        }
        // 最多连续 3 次
        if (skill === this._lastSkill && this._sameCount >= 3) {
            const pool = (this._phase2 ? ['dash', 'roar'] : ['wind', 'dash', 'roar']).filter(x => x !== skill);
            skill = pool[Math.floor(Math.random() * pool.length)];
        }
        return skill;
    }

    _startSkill(skill) {
        if (skill === this._lastSkill) this._sameCount++;
        else { this._lastSkill = skill; this._sameCount = 1; }

        if (skill === 'wind') { this._setState('wind_hover'); this._vel(0, 0); }
        else if (skill === 'dash') {
            // 大改: 不再飞到左右侧, 直接进入"靠近 → 蓄力 → 冲刺"
            this._setState('dash_approach');
            this._dashHit = false;
        }
        else if (skill === 'roar') { this._setState('roar'); this._vel(0, 0); this._roarStarted = false; }
    }

    _enterCooldown() {
        this._cooldownDur = this._phase2 ? 1500 : 3000;   // (用户) 二阶段冷却 2.5s→1.5s
        this._setState('idle');
        this._wanderTarget = this._randomArenaPoint();
    }

    // ── WIND ──
    _updateWindHover(dt, p) {
        this._wander(dt);   // 放技能时也漂移, 不停在空中
        this._faceTowards(p.x);
        if (this._t >= 2000) {
            this._setState('wind_rings');
            this._ringsSpawned = 0;
            this._ringTick = 0;
            this._rings = [];
            this._spawnRing();
        }
    }

    _spawnRing() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, Math.random() < 0.5 ? 'ForceWingsFlap' : 'ForceWingsFlap2');   // (用户) 冲击波音效 2选1 随机
        const g = this.scene.add.circle(this.x, this.y, 8, 0x66ccff, 0).setStrokeStyle(3, 0x88ddff, 0.9).setDepth(19);
        if (this.scene.uiCam) { try { this.scene.uiCam.ignore(g); } catch (e) {} }
        this._rings.push({ g, r: 8, cx: this.x, cy: this.y, hit: false });
        this._ringsSpawned++;
    }

    _updateWindRings(dt, time, p) {
        this._wander(dt);   // 放技能时也漂移
        this._ringTick += dt * 1000;
        // 每秒一圈, 共 3 圈
        if (this._ringsSpawned < 3 && this._ringTick >= 1000) {
            this._ringTick -= 1000;
            this._spawnRing();
        }
        // 扩散 + 击退判定
        const maxR = Math.hypot(this.arena.x2 - this.arena.x1, this.arena.y2 - this.arena.y1);
        for (let i = this._rings.length - 1; i >= 0; i--) {
            const ring = this._rings[i];
            ring.r += this.RING_SPEED * dt;
            ring.g.setRadius(ring.r);
            ring.g.setStrokeStyle(3, 0x88ddff, Math.max(0, 0.9 * (1 - ring.r / maxR)));
            // 玩家距 ring 中心
            const pd = Math.hypot(p.x - ring.cx, p.y - ring.cy);
            if (!ring.hit && Math.abs(pd - ring.r) < 24) {
                ring.hit = true;
                const dir = (p.x >= ring.cx) ? 1 : -1;
                this.scene._windKnockVx = dir * this.WALK_SPEED;   // 叠加到玩家速度 (顶着走可抵消)
                this._windPushUntil = time + 150;                  // 推 ~2 格的时长
            }
            if (ring.r >= maxR) { try { ring.g.destroy(); } catch (e) {} this._rings.splice(i, 1); }
        }
        // 3 圈全放完且都消散 → 冷却
        if (this._ringsSpawned >= 3 && this._rings.length === 0) {
            this._enterCooldown();
        }
    }

    // ── DASH ──
    // ── DASH 大改 (参考小蝙蝠): 靠近 → 进 ATTACK_RANGE 停下蓄力(红色警戒) → 朝玩家冲, 撞墙/人/到距离停 ──
    // 冲刺距离 (翻倍: 旧约 5~9 格 → 新约 11~16 格)
    _dashTravel() { return Phaser.Math.Between(11, 16) * 32; }

    // 沿 ang 方向射线步进, 撞到 cavetilewall 就返回该距离 (红色警戒/冲刺都用)
    _raycastWallDist(ang, maxLen) {
        const s = this.scene;
        if (!s.walls || typeof s.walls.getChildren !== 'function') return maxLen;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const walls = s.walls.getChildren();
        for (let t = 12; t <= maxLen; t += 8) {
            const px = this.x + dx * t, py = this.y + dy * t;
            for (let i = 0; i < walls.length; i++) {
                const w = walls[i];
                if (w && w.body && px >= w.body.left && px <= w.body.right && py >= w.body.top && py <= w.body.bottom) return t;
            }
        }
        return maxLen;
    }

    // 走廊通路检测: boss→(tx,ty), 算上 boss 圆 hitbox 半宽 r (中线 + 两侧采样), 任一点在墙=不通
    // 只检测到目标点为止 (玩家身前), 身后不管 — 冲刺穿过玩家后撞墙无所谓
    _corridorClear(tx, ty, r) {
        const s = this.scene;
        if (!s.walls || typeof s.walls.getChildren !== 'function') return true;
        const walls = s.walls.getChildren();
        const dx = tx - this.x, dy = ty - this.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist, uy = dy / dist;
        const nx = -uy, ny = ux;   // 垂直方向
        const hit = (x, y) => {
            for (let i = 0; i < walls.length; i++) {
                const w = walls[i];
                if (w && w.body && x >= w.body.left && x <= w.body.right && y >= w.body.top && y <= w.body.bottom) return true;
            }
            return false;
        };
        for (let t = 16; t <= dist; t += 8) {
            const cx = this.x + ux * t, cy = this.y + uy * t;
            if (hit(cx, cy)) return false;
            if (hit(cx + nx * r, cy + ny * r) || hit(cx - nx * r, cy - ny * r)) return false;
            if (hit(cx + nx * r * 0.5, cy + ny * r * 0.5) || hit(cx - nx * r * 0.5, cy - ny * r * 0.5)) return false;
        }
        return true;
    }

    // 蓄力时画红色警戒 (朝玩家, 长度=冲刺距离, 撞 cavetilewall 截断)
    _makeDashTelegraph(p) {
        const s = this.scene;
        const ang = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
        const maxLen = this._dashTravel();
        const len = this._raycastWallDist(ang, maxLen);
        this._dashAng = ang;
        this._dashLen = len;
        const cx = this.x + Math.cos(ang) * len / 2;
        const cy = this.y + Math.sin(ang) * len / 2;
        if (this._chargeFx) { try { this._chargeFx.destroy(); } catch (e) {} this._chargeFx = null; }
        if (!(window.AbyssDiff && AbyssDiff.mode === 'extreme')) {   // (用户) EXTREME 不给 dash 红色预警, 玩家拼反应
            this._chargeFx = s.add.rectangle(cx, cy, len, 44, 0xff0000, 0.28).setDepth(19);
            this._chargeFx.setRotation(ang);
            if (s.uiCam) { try { s.uiCam.ignore(this._chargeFx); } catch (e) {} }
        }
    }

    // 靠近玩家, 进 ATTACK_RANGE 且"到玩家直线畅通"才蓄力; 被地形挡住就重定位绕行
    _updateDashApproach(dt, p) {
        this._faceTowards(p.x);
        const dx = p.x - this.x, dy = p.y - this.y, dist = Math.hypot(dx, dy) || 1;
        const ang = Math.atan2(dy, dx);
        // 进攻击范围 且 走廊够 boss 身体穿过 (算 hitbox 半宽, 只看到玩家为止) → 蓄力冲刺 (锁定此刻玩家位置)
        if (dist <= this.ATTACK_RANGE && this._corridorClear(p.x, p.y, this.DASH_CORRIDOR_R)) {
            this._sideDir = null;
            this._vel(0, 0);
            this._setState('dash_charge');
            this._chargeDur = this._phase2 ? 550 : 650;   // 蓄力时间 ((用户) 二阶段 0.55s)
            this._dashTargetX = p.x; this._dashTargetY = p.y;
            this._makeDashTelegraph(p);
            return;
        }
        if (this._t > 4000) {   // (用户) 找不到通路 → 不进冷却, 立刻随机换一个别的技能
            this._vel(0, 0); this._sideDir = null;
            const pool = ['wind', 'roar'];
            this._startSkill(pool[Math.floor(Math.random() * pool.length)]);
            return;
        }

        // 否则朝玩家飞 (重定位找能直冲的位置, 全程追玩家)
        let vx = (dx / dist) * this.APPROACH_SPEED, vy = (dy / dist) * this.APPROACH_SPEED;
        const b = this.sprite && this.sprite.body && this.sprite.body.blocked;
        const blocked = b && (b.left || b.right || b.up || b.down);
        if (blocked) {
            // 撞墙 → 认准一个垂直方向侧移绕行, 走 0.5s 再重选 (避免对着大墙左右来回抖卡死)
            const tnow = this.scene.time.now;
            if (!this._sideDir || tnow > (this._sideUntil || 0)) {
                const perpA = ang + Math.PI / 2, perpB = ang - Math.PI / 2;
                this._sideDir = (this._raycastWallDist(perpA, 180) >= this._raycastWallDist(perpB, 180)) ? perpA : perpB;
                this._sideUntil = tnow + 500;
            }
            // 侧移(主) + 朝玩家(次): 沿障碍边绕, 同时往玩家方向贴
            vx = (Math.cos(this._sideDir) * 0.85 + (dx / dist) * 0.3) * this.APPROACH_SPEED;
            vy = (Math.sin(this._sideDir) * 0.85 + (dy / dist) * 0.3) * this.APPROACH_SPEED;
            // 侧移方向也撞墙 → 该分量归零 (不反向, 反向会抖); 卡死则 0.5s 后重选 / 4s 超时换技能
            if ((b.left && vx < 0) || (b.right && vx > 0)) vx = 0;
            if ((b.up && vy < 0) || (b.down && vy > 0)) vy = 0;
        } else {
            this._sideDir = null;   // 没撞墙 → 直线追, 清侧移
        }
        this._vel(vx, vy);
    }

    _updateDashCharge(dt, p) {
        this._vel(0, 0);   // 蓄力定身 (像小蝙蝠)
        if (this._chargeFx) this._chargeFx.setAlpha(0.18 + 0.18 * Math.sin(this._t / 40));
        if (this._t >= this._chargeDur) {
            if (this._chargeFx) { try { this._chargeFx.destroy(); } catch (e) {} this._chargeFx = null; }
            this._setState('dash_go');
            if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'Bat_Dash');   // (用户) 冲刺音效
            this._dashHit = false;
            this._dashFromX = this.x; this._dashFromY = this.y;
            const spd = this._phase2 ? this.DASH_SPEED2 : this.DASH_SPEED;   // 冲刺速度 (跟小蝙蝠 480 不同)
            this._vel(Math.cos(this._dashAng) * spd, Math.sin(this._dashAng) * spd);
            this.sprite.flipX = (Math.cos(this._dashAng) >= 0);
        }
    }

    _updateDashGo(dt, p) {
        // 撞玩家
        if (!this._dashHit && this._overlapsPlayer(p, 12)) {
            this._dashHit = true;
            if (this.scene.healthSystem && this.scene.healthSystem.takeDamage) this.scene.healthSystem.takeDamage(this.DASH_DMG * (window.AbyssDiff ? AbyssDiff.get().dmgMul : 1));
            if (this.scene.diseaseSystem && this.scene.diseaseSystem.addCorrosion) this.scene.diseaseSystem.addCorrosion(5);   // (用户) boss 撞击玩家 +5 腐蚀度
        }
        const traveled = Math.hypot(this.x - this._dashFromX, this.y - this._dashFromY);
        const hitWall = this.sprite.body && !this.sprite.body.blocked.none;
        if (traveled >= this._dashLen || hitWall) {
            this._vel(0, 0);
            this._enterCooldown();
        }
    }

    _overlapsPlayer(p, pad) {
        const b = this.sprite.body;
        if (!b || !p.body) return false;
        pad = pad || 0;
        return !(b.right + pad < p.body.x || b.x - pad > p.body.right || b.bottom + pad < p.body.y || b.y - pad > p.body.bottom);
    }

    // ── ROAR ──
    _updateRoar(dt, p) {
        this._wander(dt);   // 放技能时也漂移
        this._faceTowards(p.x);
        if (!this._roarStarted) {
            this._roarStarted = true;
            if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'Bat_Scream');   // (用户) 召唤钟乳石的咆哮音效
            // 咆哮 2s + 震动 2s
            if (this.scene.cameras && this.scene.cameras.main) {
                try { this.scene.cameras.main.shake(2000, this.SHAKE_INTENSITY); } catch (e) {}
            }
            // 咆哮特效 (一圈黄环扩张)
            const ro = this.scene.add.circle(this.x, this.y, 20, 0xffaa33, 0).setStrokeStyle(4, 0xffcc55, 0.8).setDepth(19);
            this._roarFx = ro;
            if (this.scene.uiCam) { try { this.scene.uiCam.ignore(ro); } catch (e) {} }
            this.scene.tweens.add({ targets: ro, scaleX: 6, scaleY: 6, alpha: 0, duration: 2000, onComplete: () => { try { ro.destroy(); } catch (e) {} if (this._roarFx === ro) this._roarFx = null; } });
        }
        if (this._t >= 2000) { this._setState('roar_wait'); }
    }

    _updateRoarWait(dt, p) {
        this._wander(dt);   // 放技能时也漂移
        // 咆哮结束 1s 后掉钟乳石
        if (this._t >= 1000) {
            this._dropStalactites(p);
            this._enterCooldown();
        }
    }

    _dropStalactites(p) {
        if (typeof Stalactite === 'undefined') return;   // 没有 Stalactite 类就跳过
        const count = this._phase2 ? Phaser.Math.Between(15, 22) : Phaser.Math.Between(10, 17);   // (用户) 加量
        Stalactite.rain(this.scene, {
            count: count,
            ceilingY: this.ceilingTop + 16,   // 生成点往下移 16 (一个 block 高) → 落在钟乳石 block 本体最下方边
            groundY: this.groundY,
            minX: this.arena.x1 + 64,   // 往内缩 2 格, 避开天花板边缘墙列 (否则钟乳石生成在边缘墙里)
            maxX: this.arena.x2 - 96,   // 往内缩 3 格, 同上
            playerX: p.x,            // 必有一颗砸玩家当前 x
            telegraph: 700,          // 咆哮结束后立刻出红色弹道提示
            damage: this.STAL_DMG
        });
    }

    // ───────── 受伤 / 死亡 ─────────
    // 清掉所有技能残留贴图 (风环冲击波 / dash 红光 / 咆哮黄圈) — 玩家死亡时调用, 防止技能贴图冻结残留
    _clearSkillFx() {
        if (this._rings) {
            this._rings.forEach(r => { if (r && r.g) { try { r.g.destroy(); } catch (e) {} } });
            this._rings = [];
        }
        this._ringsSpawned = 0;
        if (this._chargeFx) { try { this._chargeFx.destroy(); } catch (e) {} this._chargeFx = null; }
        if (this._roarFx)   { try { this._roarFx.destroy(); }   catch (e) {} this._roarFx = null; }
        if (this.scene) this.scene._windKnockVx = 0;
    }

    takeDamage(dmg) {
        if (this.dead) return;
        this.hp = Math.max(0, this.hp - (dmg || 0));
        // (用户) 受伤音效 2选1 随机, 两种共用 1 秒 CD
        const _sfxNow = this.scene.time.now;
        if (_sfxNow - (this._hurtSfxAt || 0) >= 1000) {
            this._hurtSfxAt = _sfxNow;
            if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, Math.random() < 0.5 ? 'Bat_hurt' : 'Bat_hurt2');
        }
        // 受击红闪
        if (this.sprite && this.sprite.setTint) {
            this.sprite.setTint(0xff5555);
            this.scene.time.delayedCall(100, () => { if (this.sprite && this.sprite.clearTint) this.sprite.clearTint(); });
        }
        if (this.hp <= 0) this._die();
    }

    _die() {
        if (this.dead) return;
        this.dead = true;
        // (用户成就) 逆风而行: 全程没打烂任何蝙蝠巢
        if (typeof AchievementSystem !== 'undefined' && this.scene && !this.scene._achNestBroken) AchievementSystem.unlock(this.scene, 'sz4_headwind');
        if (this.scene._windKnockVx) this.scene._windKnockVx = 0;
        this._rings.forEach(r => { try { r.g.destroy(); } catch (e) {} });
        this._rings = [];
        this._vel(0, 0);
        this._clearSkillFx();
        if (this._hpBg) this._hpBg.destroy();
        if (this._hpBar) this._hpBar.destroy();
        // 死亡序列 (最后咆哮 → 蝙蝠/巢死 → 坠机 → 落地掉落 + 水晶扩散) 交给场景的 batboss_defeated 处理
        try { this.scene.events.emit('batboss_defeated', { x: this.x, y: this.y }); } catch (e) {}
    }

    destroy() {
        if (this._windKnockVx && this.scene) this.scene._windKnockVx = 0;
        this._rings.forEach(r => { try { r.g.destroy(); } catch (e) {} });
        if (this._hpBg) { try { this._hpBg.destroy(); } catch (e) {} }
        if (this._hpBar) { try { this._hpBar.destroy(); } catch (e) {} }
        if (this._chargeFx) { try { this._chargeFx.destroy(); } catch (e) {} }
        if (this.sprite) { try { this.sprite.destroy(); } catch (e) {} }
    }
}

// (用户) Bat_boss 三套动画注册 (幂等; 帧数 frameTotal 自适应 — roar 表宽 1440/144=10 帧也照吃)
BatBoss._registerAnims = function (scene) {
    const mk = (tex, key, fps, repeat) => {
        if (!scene.textures.exists(tex) || scene.anims.exists(key)) return;
        const ft = scene.textures.get(tex).frameTotal;   // 含 __BASE → 实际帧 = ft - 1
        scene.anims.create({ key: key, frames: scene.anims.generateFrameNumbers(tex, { start: 0, end: Math.max(0, ft - 2) }), frameRate: fps, repeat: repeat });
    };
    mk('Bat_boss_fly', 'bat_boss_fly', 10, -1);
    mk('Bat_boss_dash', 'bat_boss_dash', 14, -1);
    mk('Bat_boss_roar', 'bat_boss_roar', 10, 0);
    mk('Bat_boss_wakes_up', 'bat_boss_wakes_up', 12, 0);   // (用户) 苏醒 15 帧 (~1.25s)
    mk('Bat_boss_dead', 'bat_boss_dead', 14, 0);           // (用户) 坠地死亡 31 帧 (~2.2s)
};

if (typeof window !== 'undefined') window.BatBoss = BatBoss;