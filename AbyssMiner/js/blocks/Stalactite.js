/**
 * Stalactite — 钟乳石 (倒挂天花板, 可穿透; BatBoss 咆哮后下落攻击)
 *
 * 两种模式:
 *   mode 'ceiling' (默认): 倒挂在天花板的装饰, 玩家可穿过 (纯视觉, 无碰撞).
 *                          调 .drop() 让它从当前位置生成一颗下落钟乳石.
 *   mode 'falling':        下落投射物. 先显示红色弹道提示 (telegraph 毫秒),
 *                          然后从 ceilingY 往下落, 砸中玩家扣 damage 血并消失,
 *                          落到 groundY 也消失.
 *
 * 用法 (装饰):
 *   const s = new Stalactite(scene, x, { ceilingY: 4*32, groundY: 18*32 });
 *   s.drop();   // boss 咆哮时触发下落
 *
 * 用法 (boss 直接降一批, 推荐):
 *   Stalactite.rain(scene, {
 *       count: 6, ceilingY: 4*32, groundY: 18*32,
 *       minX: 2*32, maxX: 49*32, playerX: scene.player.x,  // 必有一颗砸玩家当前 x
 *       telegraph: 700, damage: 15
 *   });
 *
 * 场景 update() 里需驱动: (this._stalactites || []).forEach(s => s.update());
 * (构造时已自动 push 进 scene._stalactites)
 */
class Stalactite {
    constructor(scene, x, options = {}) {
        this.scene = scene;
        this.x = x;
        this.mode = options.mode || 'ceiling';
        this.damage = options.damage != null ? options.damage : 15;
        this.ceilingY = options.ceilingY != null ? options.ceilingY : 0;
        this.groundY = options.groundY != null ? options.groundY
                       : ((scene.physics && scene.physics.world && scene.physics.world.bounds.height) || 720);
        // 钟乳石变体 (首次随机 1/2/3 并永久保存) — block + 下落都用同一张, 碎裂用对应 _shatter
        this._variant = Stalactite._resolveVariant(scene);
        const variantTex = 'Stalactite' + this._variant;
        this.texture = options.texture || (scene.textures.exists(variantTex) ? variantTex : 'Stalactite');
        this.gravity = options.gravity != null ? options.gravity : 1800;

        this._done = false;
        this._falling = false;
        this._dropped = false;
        this._vy = 0;
        this.sprite = null;
        this._telegraph = null;

        scene._stalactites = scene._stalactites || [];
        scene._stalactites.push(this);

        if (this.mode === 'ceiling') {
            this._buildCeiling();
        } else {
            this._startFalling(options.telegraph != null ? options.telegraph : 600);
        }
    }

    // ---- 静态: boss 降一批钟乳石 ----
    static rain(scene, opts = {}) {
        const count = opts.count != null ? opts.count : 6;
        const minX = opts.minX != null ? opts.minX : 0;
        const maxX = opts.maxX != null ? opts.maxX : ((scene.physics && scene.physics.world && scene.physics.world.bounds.width) || 1280);
        const xs = [];
        // 必有一颗砸玩家当前 x
        if (opts.playerX != null) xs.push(opts.playerX);
        // 其余随机, 且每颗 x 尽量不一样 (至少隔 28px)
        let guard = 0;
        while (xs.length < count && guard < count * 30) {
            guard++;
            const rx = Phaser.Math.Between(minX, maxX);
            if (xs.every(x => Math.abs(x - rx) >= 28)) xs.push(rx);
        }
        return xs.map(x => new Stalactite(scene, x, {
            mode: 'falling',
            ceilingY: opts.ceilingY != null ? opts.ceilingY : 0,
            groundY: opts.groundY,
            damage: opts.damage,
            telegraph: opts.telegraph,
            texture: opts.texture,
            gravity: opts.gravity
        }));
    }

    // 钟乳石变体: 会话缓存(registry) → localStorage → 首次随机 1/2/3 并永久保存
    static _resolveVariant(scene) {
        try {
            if (scene && scene.registry && scene.registry.has('stalactiteVariant')) {
                return scene.registry.get('stalactiteVariant');
            }
        } catch (e) {}
        let v = NaN;
        try { v = parseInt(localStorage.getItem('abyssMinerStalactiteVariant'), 10); } catch (e) {}
        if (!(v === 1 || v === 2 || v === 3)) {
            v = Phaser.Math.Between(1, 3);
            try { localStorage.setItem('abyssMinerStalactiteVariant', String(v)); } catch (e) {}
        }
        try { if (scene && scene.registry) scene.registry.set('stalactiteVariant', v); } catch (e) {}
        return v;
    }

    _makeSprite(y, depth) {
        const s = this.scene;
        let sp;
        if (s.textures.exists(this.texture)) {
            sp = s.add.sprite(this.x, y, this.texture).setOrigin(0.5, 0).setDepth(depth);
            sp.setDisplaySize(16, 16);   // 16x16, 挂在格子顶部中心
        } else {
            // fallback: 16x16 灰蓝倒三角
            sp = s.add.triangle(this.x, y, -8, 0, 8, 0, 0, 16, 0x9aa8bb)
                .setStrokeStyle(2, 0x5a6675).setOrigin(0.5, 0).setDepth(depth);
        }
        if (s.uiCam) { try { s.uiCam.ignore(sp); } catch (e) {} }
        return sp;
    }

    _buildCeiling() {
        this.sprite = this._makeSprite(this.ceilingY, 8);
    }

    // 把天花板这颗变成下落 (boss 咆哮触发)
    drop(telegraphMs) {
        if (this._dropped || this._done) return;
        this._dropped = true;
        if (this.sprite) { try { this.sprite.destroy(); } catch (e) {} this.sprite = null; }
        this.mode = 'falling';
        this._startFalling(telegraphMs != null ? telegraphMs : 600);
    }

    // 找该列天花板下方最近的 cavetilewall 顶部 (没有则到地面) — 钟乳石落到这里碎掉
    _computeStopY() {
        const s = this.scene;
        let stopY = this.groundY;
        if (s.walls && typeof s.walls.getChildren === 'function') {
            s.walls.getChildren().forEach(w => {
                if (!w || !w.body) return;
                if (this.x < w.body.left || this.x > w.body.right) return;  // 不在该列
                const wallTop = w.body.top;
                if (wallTop <= this.ceilingY + 4) return;   // 墙在天花板之上/同高
                if (wallTop < stopY) stopY = wallTop;
            });
        }
        return stopY;
    }

    _startFalling(telegraphMs) {
        const s = this.scene;
        // 落点: 该列最近的墙顶 (撞墙就停/碎), 否则到地面
        this._stopY = this._computeStopY();
        // 红色弹道提示 (从天花板到落点竖线, 宽 16 跟钟乳石一致), 碰到墙就停
        const lineH = Math.max(8, this._stopY - this.ceilingY);
        this._telegraph = s.add.rectangle(this.x, this.ceilingY + lineH / 2, 16, lineH, 0xff0000, 0.35).setDepth(7);
        if (s.uiCam) { try { s.uiCam.ignore(this._telegraph); } catch (e) {} }
        this._tlTween = s.tweens.add({ targets: this._telegraph, alpha: 0.12, duration: 180, yoyo: true, repeat: -1 });

        s.time.delayedCall(telegraphMs, () => {
            if (this._tlTween) { try { this._tlTween.stop(); } catch (e) {} this._tlTween = null; }
            if (this._telegraph) { try { this._telegraph.destroy(); } catch (e) {} this._telegraph = null; }
            if (this._done) return;
            this._spawnFalling();
        });
    }

    _spawnFalling() {
        // (用户) 优先 Stalactite{N}_drop 下落动画 (24×48 / 5 帧, 与变体配对); 缺图回退静态贴图
        const s = this.scene;
        const dropTex = 'Stalactite' + (this._variant || 1) + '_drop';
        const dropKey = 'stalactite' + (this._variant || 1) + '_drop';
        // 惰性注册 (SZ 场景不跑 GameScene.create 的动画注册段)
        if (s.anims && s.textures.exists(dropTex) && !s.anims.exists(dropKey)) {
            try { s.anims.create({ key: dropKey, frames: s.anims.generateFrameNumbers(dropTex, { start: 0, end: 4 }), frameRate: 12, repeat: -1 }); } catch (e) {}
        }
        if (s.textures.exists(dropTex) && s.anims && s.anims.exists(dropKey)) {
            this.sprite = s.add.sprite(this.x, this.ceilingY, dropTex).setOrigin(0.5, 0).setDepth(60);
            this.sprite.setDisplaySize(16, 32);   // 24×48 × (16/24) 同缩放比
            this.sprite.play(dropKey);
            if (s.uiCam) { try { s.uiCam.ignore(this.sprite); } catch (e) {} }
            this._visH = 32;
        } else {
            this.sprite = this._makeSprite(this.ceilingY, 60);
            this._visH = 16;
        }
        this._falling = true;
        this._vy = 0;
    }

    update() {
        if (this._done || !this._falling || !this.sprite) return;
        const s = this.scene;
        const dt = ((s.game && s.game.loop && s.game.loop.delta) || 16) / 1000;
        this._vy += this.gravity * dt;
        this.sprite.y += this._vy * dt;

        // 16x16 hitbox 贴在可视底部 (drop 动画帧更高, 危险区取尖端): [x-8,x+8] × [y+visH-16, y+visH]
        const visH = this._visH || 16;
        const sLeft = this.sprite.x - 8, sRight = this.sprite.x + 8;
        const sTop = this.sprite.y + visH - 16, sBot = this.sprite.y + visH;

        // 砸到玩家 (AABB vs 玩家 body)
        const p = s.player;
        if (p && p.body && s.healthSystem && !s.healthSystem.isDead) {
            const b = p.body;
            if (sRight > b.x && sLeft < b.x + b.width && sBot > b.y && sTop < b.y + b.height) {
                s.healthSystem.takeDamage(this.damage);
                if (s.diseaseSystem && s.diseaseSystem.addCorrosion) s.diseaseSystem.addCorrosion(1);   // (用户) 钟乳石砸中 +1 腐蚀度
                this._impact();
                return;
            }
        }
        // 撞到墙顶 (落点) → 碎掉消失
        const stopY = (this._stopY != null) ? this._stopY : this.groundY;
        if (sBot >= stopY) {
            this._impact();
        }
    }

    _impact() {
        if (this._done) return;
        this._done = true;
        const s = this.scene;
        const ix = this.sprite ? this.sprite.x : this.x;
        const iy = this.sprite ? this.sprite.y : this.groundY;
        if (this.sprite) { try { this.sprite.destroy(); } catch (e) {} this.sprite = null; }
        const landY = iy + (this._visH || 16);   // 钟乳石底部 = 落点 (drop 动画帧高 32)
        // 碎裂动画: 优先 stalactite{N}_shatter, 否则 fallback 小方块特效
        const shatterKey = 'stalactite' + (this._variant || 1) + '_shatter';
        const shatterTex = 'Stalactite' + (this._variant || 1) + '_shatter';
        if (s.anims && s.anims.exists(shatterKey) && s.textures.exists(shatterTex)) {
            const fx = s.add.sprite(ix, landY, shatterTex).setOrigin(0.5, 1).setDepth(60);
            fx.setScale(16 / 24);   // 与钟乳石方块同缩放 (块: 24→16)
            if (s.uiCam) { try { s.uiCam.ignore(fx); } catch (e) {} }
            fx.play(shatterKey);
            fx.once('animationcomplete', () => { try { fx.destroy(); } catch (e) {} });
        } else if (s && s.add) {
            for (let i = 0; i < 5; i++) {
                const f = s.add.rectangle(ix, iy + 20, 4, 4, 0x9aa8bb).setDepth(60);
                if (s.uiCam) { try { s.uiCam.ignore(f); } catch (e) {} }
                s.tweens.add({
                    targets: f, x: ix + Phaser.Math.Between(-30, 30), y: iy + 20 + Phaser.Math.Between(-6, 18),
                    alpha: 0, duration: 320, onComplete: () => { try { f.destroy(); } catch (e) {} }
                });
            }
        }
    }

    destroy() {
        this._done = true;
        if (this._tlTween) { try { this._tlTween.stop(); } catch (e) {} this._tlTween = null; }
        if (this._telegraph) { try { this._telegraph.destroy(); } catch (e) {} this._telegraph = null; }
        if (this.sprite) { try { this.sprite.destroy(); } catch (e) {} this.sprite = null; }
        const arr = this.scene && this.scene._stalactites;
        if (arr) { const i = arr.indexOf(this); if (i >= 0) arr.splice(i, 1); }
    }
}

if (typeof window !== 'undefined') window.Stalactite = Stalactite;