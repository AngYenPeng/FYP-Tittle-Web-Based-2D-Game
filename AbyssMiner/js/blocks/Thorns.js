/**
 * Thorns — 荆棘 (可穿透危险方块)
 *
 * 行为:
 *   - 玩家可以穿过去 (无碰撞, 类似空气方块)
 *   - 玩家身体接触期间: 每秒扣 5 血 (接触瞬间立刻扣一次, 之后每 1 秒一次)
 *   - 玩家离开后: 施加 "每秒扣 1 血 × 3 秒" 的 DoT debuff (走 diseaseSystem.addHpDoT)
 *
 * 用法:
 *   new Thorns(scene, col, row);                       // 1 格荆棘
 *   new Thorns(scene, col, row, { wCells: 3 });        // 3 格宽
 *   // 在场景 update() 里驱动: (this._thorns || []).forEach(t => t.update());
 *   // (构造时已自动 push 进 scene._thorns)
 */
class Thorns {
    constructor(scene, col, row, options = {}) {
        this.scene = scene;
        const G = 32;
        const wCells = options.wCells || 1;
        const hCells = options.hCells || 1;
        this.w = wCells * G;
        this.h = hCells * G;
        // 左上角对齐格子, 中心算出来
        this.x = col * G + this.w / 2;
        this.y = row * G + this.h / 2 + (options.yOffset || 0);

        this.contactDamage = options.contactDamage != null ? options.contactDamage : 5;  // 接触每秒伤害
        this.dotPerSec = options.dotPerSec != null ? options.dotPerSec : 1;               // 离开后 DoT 每秒
        this.dotSeconds = options.dotSeconds != null ? options.dotSeconds : 3;            // 离开后 DoT 持续秒

        // 矩形边界 (AABB 判定用)
        this.left = this.x - this.w / 2;
        this.right = this.x + this.w / 2;
        this.top = this.y - this.h / 2;
        this.bottom = this.y + this.h / 2;

        // 视觉 — 优先用 Thorns 贴图 (按格平铺), fallback 暗红尖刺矩形
        this.sprites = [];
        if (options.texture !== false && scene.textures.exists(options.texture || 'Thorns')) {
            const key = options.texture || 'Thorns';
            this._baseTexKey = key;   // (用户) 触碰动画播完回这张静态图
            for (let cx = 0; cx < wCells; cx++) {
                for (let cy = 0; cy < hCells; cy++) {
                    const sp = scene.add.sprite(col * G + cx * G + G / 2, row * G + cy * G + G / 2 + (options.yOffset || 0), key)
                        .setDisplaySize(G, G).setDepth(7);
                    this.sprites.push(sp);
                }
            }
        } else {
            // fallback: 暗红底 + 几根尖刺三角
            const base = scene.add.rectangle(this.x, this.y, this.w, this.h, 0x5a1020, 0.85).setDepth(7);
            this.sprites.push(base);
            const spikeN = Math.max(2, Math.round(this.w / 14));
            for (let i = 0; i < spikeN; i++) {
                const sx = this.left + (i + 0.5) * (this.w / spikeN);
                const tri = scene.add.triangle(sx, this.bottom, -5, 0, 5, 0, 0, -18, 0x992233)
                    .setOrigin(0.5, 1).setDepth(7);
                this.sprites.push(tri);
            }
        }
        if (scene.uiCam) {
            try { this.sprites.forEach(s => scene.uiCam.ignore(s)); } catch (e) {}
        }

        // 状态
        this._wasOverlapping = false;
        this._lastTick = 0;

        // (用户) Thorns_move 触碰动画 (320×32/10帧, 幂等注册): 重叠+向右=正放, 向左=倒放
        if (scene.textures.exists('Thorns_move') && scene.anims && !scene.anims.exists('thorns_move')) {
            const ft = scene.textures.get('Thorns_move').frameTotal;   // 含 __BASE → 实际帧 = ft - 1
            scene.anims.create({ key: 'thorns_move', frames: scene.anims.generateFrameNumbers('Thorns_move', { start: 0, end: Math.max(0, ft - 2) }), frameRate: 20, repeat: 0 });
        }
        this._animDir = null;
        this._animOK = !!(this._baseTexKey && scene.anims && scene.anims.exists('thorns_move') && this.sprites.length && this.sprites[0].play);

        // 自动注册到场景数组 (场景 update 里 forEach 调 update)
        scene._thorns = scene._thorns || [];
        scene._thorns.push(this);
    }

    // 玩家 body 是否与荆棘矩形重叠
    _playerOverlaps() {
        const p = this.scene.player;
        if (!p || !p.body) return false;
        const b = p.body;
        return !(b.right < this.left || b.x > this.right || b.bottom < this.top || b.y > this.bottom);
    }

    update() {
        const s = this.scene;
        if (!s.healthSystem || s.healthSystem.isDead) { this._wasOverlapping = false; return; }
        const now = s.time.now;
        const over = this._playerOverlaps();

        if (over) {
            // 接触瞬间立刻扣一次, 之后每秒一次
            if (!this._wasOverlapping || (now - this._lastTick) >= 1000) {
                this._lastTick = now;
                s.healthSystem.takeDamage(this.contactDamage, { ignoreIframe: true, triggerIframe: false });
                if (s.diseaseSystem && s.diseaseSystem.addCorrosion) s.diseaseSystem.addCorrosion(1);   // (用户) 荆棘每秒 +1 腐蚀度
            }
            this._wasOverlapping = true;
        } else {
            if (this._wasOverlapping) {
                // 刚离开 → 施加离开 DoT (每秒 dotPerSec × dotSeconds 秒)
                if (s.diseaseSystem && s.diseaseSystem.addHpDoT) {
                    s.diseaseSystem.addHpDoT(this.dotPerSec, this.dotSeconds);
                }
            }
            this._wasOverlapping = false;
        }

        this._updateMoveAnim(over);
    }

    // (用户) 触碰动画规则: 玩家 hitbox 重叠且向右移动 → 正放一整套; 向左 → 倒放一整套;
    //        每套必须播完才换 — 播完时按当下状态: 还在同向=续播, 换向=换方向, 停了/离开=回静态 Thorns 图
    _updateMoveAnim(over) {
        if (!this._animOK) return;
        const p = this.scene.player;
        const vx = (over && p && p.body) ? p.body.velocity.x : 0;
        const desired = (over && vx > 20) ? 'fwd' : ((over && vx < -20) ? 'rev' : null);
        const lead = this.sprites[0];
        if (lead.anims && lead.anims.isPlaying) return;   // 一整套没播完不打断
        if (desired === 'fwd') {
            this.sprites.forEach(sp => { if (sp.play) sp.play('thorns_move'); });
            this._animDir = 'fwd';
        } else if (desired === 'rev') {
            this.sprites.forEach(sp => { if (sp.playReverse) sp.playReverse('thorns_move'); });
            this._animDir = 'rev';
        } else if (this._animDir) {
            this.sprites.forEach(sp => { if (sp.setTexture) sp.setTexture(this._baseTexKey); });
            this._animDir = null;
        }
    }

    destroy() {
        this.sprites.forEach(sp => { try { sp.destroy(); } catch (e) {} });
        this.sprites = [];
        const arr = this.scene && this.scene._thorns;
        if (arr) { const i = arr.indexOf(this); if (i >= 0) arr.splice(i, 1); }
    }
}

if (typeof window !== 'undefined') window.Thorns = Thorns;