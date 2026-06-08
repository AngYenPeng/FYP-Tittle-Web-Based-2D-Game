/**
 * GuideSystem — 攻略指南（类似星铁的教学页面）
 *
 * 用法：
 *   const guide = new GuideSystem(scene);
 *   guide.init();
 *   guide.registerGuide({ id: 'movement', title: 'Movement', anim: 'walk', text: '...' });
 *   guide.open();  // 自动选未读 guide，没有未读则选最新
 *   guide.hasUnread()  // 是否有未读（红点）
 *
 * 数据结构：
 *   guides = [
 *     { id, title, animType, captionText }
 *   ]
 *
 * 已读状态保存在 localStorage 'abyssMinerGuidesRead' 里
 *
 * 显示：
 *   - 全屏面板（覆盖游戏画面，但游戏不暂停）
 *   - 左侧 guide 列表
 *   - 右侧动画区 + 字幕
 *   - 关闭按钮 ✕
 *
 * 这个系统不影响游戏进度（游戏继续运行，但 _guideOpen=true 时玩家无法操作）
 */
class GuideSystem {
    constructor(scene) {
        this.scene = scene;
        this.isOpen = false;
        this.panel = null;
        this.guides = [];
        this.currentGuideId = null;
        this.readSet = new Set();
        this._loadReadStatus();
        this._loadUnlockedGuides();   // 载入之前所有场景/存档解锁过的 guide (跨场景继承)
    }

    init() {
        // 注册默认 guides（移动 + 跳跃）
        this.registerGuide({
            id: 'movement',
            title: 'Movement',
            animType: 'walk',
            captionText: 'A = Move Left,  D = Move Right'
        });
        this.registerGuide({
            id: 'jumping',
            title: 'Jumping',
            animType: 'jump',
            captionText: 'SPACE / W = Jump'
        });
        // 双手已解锁 (SZ3 任务解锁过 / SZ4·SZ5 进场自动解锁 / registry 跨场景带入) → 补上丢稿子系列引导
        const sc = this.scene;
        if (sc && (sc._pickaxeUpgraded || (sc.registry && sc.registry.get && sc.registry.get('pickaxeUpgraded')))) {
            this.registerDualHandGuides();
        }
    }

    /** 双手解锁 → 投掷战斗 + 抓墙荡跃 两条引导 (registerGuide 按 id 去重, 可重复调用) */
    registerDualHandGuides() {
        this.registerGuide({
            id: 'throw_combat',
            title: 'Throw & Recall',
            animType: 'throw_combat',
            captionText: 'Right-click to throw your pickaxe at enemies. Click again to recall it. Defeated enemies drop crystals — walk over them to collect.'
        });
        this.registerGuide({
            id: 'advanced_move',
            title: 'Grapple & Swing',
            animType: 'advanced_move',
            captionText: 'Throw your pickaxe into a wall, then left-click to reel toward it. Press S while hanging to crouch. With both hands unlocked, press F to switch the active pickaxe and chain swings between walls.'
        });
    }

    registerGuide(g) {
        if (!g || !g.id) return;
        if (this.guides.find(x => x.id === g.id)) return;
        this.guides.push(g);
        this._persistUnlockedGuide(g);   // 持久化 → 之后所有场景都能看到 (guide 继承)
    }

    // 把解锁的 guide 完整定义存进 localStorage (跨场景累积)
    _persistUnlockedGuide(g) {
        try {
            const map = JSON.parse(localStorage.getItem('abyssMinerGuidesUnlocked') || '{}');
            map[g.id] = { id: g.id, title: g.title, animType: g.animType, captionText: g.captionText };
            localStorage.setItem('abyssMinerGuidesUnlocked', JSON.stringify(map));
        } catch (e) {}
    }

    // 载入之前(任何场景/会话)解锁过的全部 guide, 直接进 this.guides (不重复持久化)
    _loadUnlockedGuides() {
        try {
            const map = JSON.parse(localStorage.getItem('abyssMinerGuidesUnlocked') || '{}');
            Object.keys(map).forEach(id => {
                const g = map[id];
                if (g && g.id && !this.guides.find(x => x.id === g.id)) this.guides.push(g);
            });
        } catch (e) {}
    }

    hasUnread() {
        return this.guides.some(g => !this.readSet.has(g.id));
    }

    unreadCount() {
        return this.guides.filter(g => !this.readSet.has(g.id)).length;
    }

    _loadReadStatus() {
        try {
            const arr = JSON.parse(localStorage.getItem('abyssMinerGuidesRead') || '[]');
            this.readSet = new Set(arr);
        } catch { this.readSet = new Set(); }
    }

    _saveReadStatus() {
        try {
            localStorage.setItem('abyssMinerGuidesRead', JSON.stringify([...this.readSet]));
        } catch {}
    }

    _markRead(id) {
        this.readSet.add(id);
        this._saveReadStatus();
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        if (this.scene && this.scene._setUIPause) this.scene._setUIPause(true, { lite: true });   // (用户) guide 打开 → 轻量暂停 (世界冻结, 但时钟/补间/动画给演示用)
        this.scene._guideOpen = true;

        // 默认打开未读 guide，否则最新
        const unread = this.guides.find(g => !this.readSet.has(g.id));
        const target = unread || this.guides[this.guides.length - 1];
        if (!target) return;

        this._buildPanel();
        this.showGuide(target.id);
    }

    /** (用户) 统一演示清理 — close() 与切换 demo 共用.
     *  关键次序: 先 killTweensOf 再 destroy — 否则 tween onComplete 摸已销毁对象 (reading 'play' 崩溃);
     *  字段全覆盖 — 旧 close() 漏掉血条/腐蚀条/绳/稿等 11 个字段, 导致关闭后粘在镜头上. */
    _cleanupDemo() {
        const s = this.scene;
        const FIELDS = ['_animSprite', '_demoObstacle', '_demoGround', '_demoCrystal', '_demoDrop',
            '_demoEnemy', '_demoCrackGfx', '_demoCheckpointSprite', '_demoHpBg', '_demoHpFill',
            '_demoHpLabel', '_demoCorBg', '_demoCorFill', '_demoCorLabel', '_demoDetectorIcon',
            '_demoPick', '_demoRope', '_demoFKey', '_demoHealFx'];
        // 1) 杀 tween (含 tiles / stone 碎片里的局部对象, 如 advmove 的 pick2)
        FIELDS.forEach(k => { if (this[k]) { try { s.tweens.killTweensOf(this[k]); } catch (e) {} } });
        (this._demoTiles || []).forEach(t => { try { s.tweens.killTweensOf(t); } catch (e) {} });
        (this._demoStoneSprites || []).forEach(sp => { try { s.tweens.killTweensOf(sp); } catch (e) {} });
        if (this._demoTween) { try { this._demoTween.stop(); } catch (e) {} this._demoTween = null; }
        // 2) 计时器
        (this._demoTimers || []).forEach(t => { if (t && t.remove) t.remove(false); });
        this._demoTimers = [];
        // 3) 销毁
        FIELDS.forEach(k => { if (this[k]) { try { this[k].destroy(); } catch (e) {} this[k] = null; } });
        (this._demoStoneSprites || []).forEach(sp => { if (sp && sp.scene) sp.destroy(); });
        this._demoStoneSprites = [];
        (this._demoTiles || []).forEach(t => { try { t.destroy(); } catch (e) {} });
        this._demoTiles = [];
        this._demoCells = null; this._demoGridMeta = null;
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        if (this.scene && this.scene._setUIPause) this.scene._setUIPause(false);
        this.scene._guideOpen = false;
        this.scene._suppressNextClick = true;
        // 清滚轮 handler
        if (this._listWheelHandler) {
            this.scene.input.off('wheel', this._listWheelHandler);
            this._listWheelHandler = null;
        }
        if (this.panel) {
            this.panel.destroy();
            this.panel = null;
        }
        this._cleanupDemo();
    }

    _buildPanel() {
        const s = this.scene;
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;

        this.panel = s.add.container(W / 2, H / 2)
            .setScrollFactor(0).setDepth(970);

        const PW = W - 80, PH = H - 80;

        // 1. 背景 + 标题（先加，最底层）
        const bg = s.add.rectangle(0, 0, PW, PH, 0x0a0a18, 0.97)
            .setStrokeStyle(3, 0x6688aa);

        const title = s.add.text(0, -PH / 2 + 30, 'GUIDE', {
            fontSize: '36px', color: '#ffcc55', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);

        const closeBtn = s.add.text(PW / 2 - 30, -PH / 2 + 30, '✕', {
            fontSize: '36px', color: '#ff5555', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', (ptr) => { if (ptr.button === 0) this.close(); });
        closeBtn.on('pointerover', () => closeBtn.setColor('#ff8888'));
        closeBtn.on('pointerout',  () => closeBtn.setColor('#ff5555'));

        // 左侧分隔线
        const sepX = -PW / 2 + 280;
        const sep = s.add.rectangle(sepX, 0, 2, PH - 100, 0x445566, 1);

        // 右侧动画 + 字幕区域
        const rightX = sepX + 30;
        const rightW = PW - 280 - 60;

        // 内容顶部 y（标题之下留出空间）
        const contentTop = -PH / 2 + 70;
        const contentBottom = PH / 2 - 30;
        const contentH = contentBottom - contentTop;

        // === 动画区 — 占上半部分的一半（高度 = contentH / 2） ===
        const titleSpace = 50;  // 给标题留 50 像素空间
        const animTop = contentTop + titleSpace;
        const animH = contentH / 2;  // 上部分一半
        const animFrameLeft = rightX;  // 动画框左缘
        const animFrameTop = animTop;   // 动画框上缘

        this._animArea = s.add.rectangle(
            rightX + rightW / 2,
            animTop + animH / 2,
            rightW,
            animH,
            0x000000, 0.4
        ).setStrokeStyle(1, 0x445566);

        // === 标题 — 对齐动画框左上 + 抬高 25px ===
        this._rightTitle = s.add.text(animFrameLeft, animFrameTop - 25, '', {
            fontSize: '28px', color: '#88ccff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0, 1);  // 左下原点：x 对齐左、y 在动画框上方

        // === 字幕 — 动画区下方 ===
        this._caption = s.add.text(rightX + rightW / 2, animTop + animH + 30 + 24, '', {   // (用户) 说明文字下移 24px
            fontSize: '24px', color: '#ffffff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3,
            wordWrap: { width: rightW },
            align: 'center'
        }).setOrigin(0.5, 0);

        // 把这些底层先加到 panel
        this.panel.add([bg, title, closeBtn, sep, this._animArea, this._rightTitle, this._caption]);

        // 2. 左侧列表（在 bg 之上）
        const listX = -PW / 2 + 30;
        const listStartY = -PH / 2 + 90;
        this._listItems = [];
        this.guides.forEach((g, i) => {
            const itemY = listStartY + i * 60;
            const isUnread = !this.readSet.has(g.id);

            const item = s.add.container(listX, itemY);
            const itemBg = s.add.rectangle(110, 0, 220, 50, 0x1a1a2e, 1)
                .setStrokeStyle(2, 0x445566).setOrigin(0.5);
            const itemText = s.add.text(20, 0, g.title, {
                fontSize: '24px', color: '#ffffff', fontFamily: '"VT323", monospace'
            }).setOrigin(0, 0.5);
            const redDot = s.add.circle(218, -24, 7, 0xff3333);
            redDot.setVisible(isUnread);
            if (isUnread) {
                s.tweens.add({
                    targets: redDot,
                    alpha: { from: 1, to: 0.3 },
                    duration: 700,
                    yoyo: true,
                    repeat: -1
                });
            }

            item.add([itemBg, itemText, redDot]);
            // 点击 — 用默认 hitArea（基于 rectangle 几何）
            itemBg.setInteractive();
            itemBg.on('pointerdown', (ptr) => {
                if (ptr.button === 0) this.showGuide(g.id);
            });
            itemBg.on('pointerover', () => itemBg.setStrokeStyle(3, 0xffcc55));
            itemBg.on('pointerout',  () => itemBg.setStrokeStyle(2, 0x445566));

            this._listItems.push({ id: g.id, container: item, bg: itemBg, redDot, baseY: itemY });
            this.panel.add(item);
        });

        // 滚轮滚动支持（当 guides 数量超出列表区高度）
        // 列表显示区高度（PH - 上下边距）
        const listAreaH = (this.scene.cameras.main.height - 80) - 90 - 40;  // PH - 上 90 - 下 40
        const totalListH = this.guides.length * 60;
        const maxScroll = Math.max(0, totalListH - listAreaH);
        this._listScrollY = 0;
        this._listMaxScroll = maxScroll;

        if (this._listWheelHandler) {
            s.input.off('wheel', this._listWheelHandler);
        }
        this._listWheelHandler = (pointer, gameObjects, deltaX, deltaY) => {
            if (!this.isOpen) return;
            if (this._listMaxScroll <= 0) return;
            this._listScrollY = Phaser.Math.Clamp(
                this._listScrollY + deltaY * 0.5,
                0,
                this._listMaxScroll
            );
            // 应用 scroll
            this._listItems.forEach(it => {
                it.container.y = it.baseY - this._listScrollY;
            });
        };
        s.input.on('wheel', this._listWheelHandler);

        // mainCam ignore
        try { s.cameras.main.ignore(this.panel); } catch(e) {}
    }

    showGuide(id) {
        const g = this.guides.find(x => x.id === id);
        if (!g) return;
        this.currentGuideId = id;

        if (this._rightTitle) this._rightTitle.setText(g.title);
        if (this._caption) this._caption.setText(g.captionText);

        // 标记已读
        if (!this.readSet.has(id)) {
            this._markRead(id);
            // 更新列表红点
            const item = this._listItems.find(it => it.id === id);
            if (item) item.redDot.setVisible(false);
        }

        // 播放动画（在动画区域）
        this._playAnimDemo(g.animType);
    }

    _playAnimDemo(type) {
        const s = this.scene;
        this._cleanupDemo();   // (用户) 统一清理 (杀 tween → 销毁全部演示物件)

        // 动画区中心 = 新 animArea 位置
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;
        const PW = W - 80;
        const PH = H - 80;
        const sepX = -PW / 2 + 280;
        const rightX = sepX + 30;
        const rightW = PW - 280 - 60;
        const contentTop = -PH / 2 + 70;
        const contentBottom = PH / 2 - 30;
        const contentH = contentBottom - contentTop;
        const titleSpace = 50;
        const animTop = contentTop + titleSpace;
        const animH = contentH / 2;
        const cx = W / 2 + (rightX + rightW / 2);
        const cy = H / 2 + (animTop + animH / 2);

        // 动画区全局边界（用于裁切地板范围）
        const animLeft = cx - rightW / 2;
        const animRight = cx + rightW / 2;
        const animBottom = cy + animH / 2;

        // === 铺设地板瓷砖（用 Cavetile_wall_T，顶面墙皮）===
        // 瓷砖大小：原 32x32，scale 1.5 → 显示 48x48
        const TILE_DISPLAY = 48;
        // 地板顶部 y（瓷砖中心 y）= 动画区底 - 30（留点空间）
        const groundTopY = animBottom - 30;
        const groundCenterY = groundTopY + TILE_DISPLAY / 2;

        // === (用户) demo 局部格子 + 自动贴皮 — 复用游戏 CavetileWall.renderSkins 的 dist/四邻规则,
        //     上下排与各 demo 生成的墙体皮肤自动正确连接 ===
        {
            const tilesNeeded = Math.floor((rightW - 4) / TILE_DISPLAY);
            const startX = animLeft + 2 + TILE_DISPLAY / 2;
            const animTop2 = cy - animH / 2;
            let ceilY = animTop2 + TILE_DISPLAY / 2 + 5;
            const gridRows = Math.max(3, Math.round((groundCenterY - ceilY) / TILE_DISPLAY) + 1);
            ceilY = groundCenterY - (gridRows - 1) * TILE_DISPLAY;   // 吸附晶格: 地板行精确落在 groundCenterY
            this._demoCeilingY = ceilY;
            this._demoGridMeta = { originX: startX, ceilY, tile: TILE_DISPLAY, cols: tilesNeeded, rows: gridRows };
            this._demoCells = new Map();
            for (let i = 0; i < tilesNeeded; i++) { this._demoAddCell(i, 0); this._demoAddCell(i, gridRows - 1); }
            this._demoReskinCells();
        }

        // === 玩家 sprite ===
        // sprite 128x128, scale 0.7 → 显示 ~89.6x89.6
        // 玩家 origin 0.5,0.5，sprite 中心 y = groundTopY - 28（脚踩在地板上）
        const tex = s.textures.exists('Miner_stand') ? 'Miner_stand' : null;
        if (!tex) return;

        const PLAYER_SCALE = 1.0;  // 显示 128×128（高度 ≈ 2 wall + 一些）
        // body 高 64，scale 1.0 → 显示 body 高 64
        // 让 sprite 中心高于地板 = body高/2 + 20 (offset 调整空间)
        const playerY = groundTopY - 47;

        const sprite = s.add.sprite(cx, playerY, tex);
        sprite.setScale(PLAYER_SCALE).setScrollFactor(0).setDepth(976);
        try { s.cameras.main.ignore(sprite); } catch(e) {}
        this._animSprite = sprite;

        // 保存这些常量给子方法用
        const _gm = this._demoGridMeta;
        this._demoCtx = {
            cx, cy, playerY, groundTopY, animLeft, animRight, rightW,
            animTop: cy - 200,  // 动画区顶部（用于天花板对齐）
            tileDisplay: 48,
            // (用户) demo 自动贴皮格子 API
            gridCols: _gm ? _gm.cols : 0,
            gridRows: _gm ? _gm.rows : 0,
            floorRow: _gm ? _gm.rows - 1 : 0,
            cellXOf: (gx) => _gm ? _gm.originX + gx * _gm.tile : 0,
            cellYOf: (gy) => _gm ? _gm.ceilY + gy * _gm.tile : 0,
            colAt: (x) => _gm ? Math.round((x - _gm.originX) / _gm.tile) : 0,
            rowAt: (y) => _gm ? Math.round((y - _gm.ceilY) / _gm.tile) : 0,
            addWall: (gx, gy) => this._demoAddCell(gx, gy),
            reskin: () => this._demoReskinCells(),
            walkDur: (d) => Math.max(150, Math.round(Math.abs(d) / 0.375))   // (用户) 走路统一速度 = move guide 0.25px/ms 的 1.5 倍
        };

        if (type === 'walk') {
            this._demoWalk(sprite);
        } else if (type === 'jump') {
            this._demoJump(sprite);
        } else if (type === 'mine') {
            this._demoMine(sprite);
        } else if (type === 'attack') {
            this._demoAttack(sprite);
        } else if (type === 'dash') {
            this._demoDash(sprite);
        } else if (type === 'stone') {
            this._demoStone(sprite);
        } else if (type === 'platform') {
            this._demoPlatform(sprite);
        } else if (type === 'checkpoint') {
            this._demoCheckpoint(sprite);
        } else if (type === 'detector') {
            this._demoDetector(sprite);
        } else if (type === 'throw_combat') {
            this._demoThrowCombat(sprite);
        } else if (type === 'advanced_move') {
            this._demoAdvMove(sprite);
        } else if (type === 'thorn') {
            this._demoThorn(sprite);
        } else {
            if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
        }
    }

    /** (用户) demo 格子: 注册一格墙 (贴图由 _demoReskinCells 统一决定) */
    _demoAddCell(gx, gy) {
        const s = this.scene, m = this._demoGridMeta;
        if (!m) return null;
        const k = gx + ',' + gy;
        if (this._demoCells.has(k)) return this._demoCells.get(k);
        const x = m.originX + gx * m.tile, y = m.ceilY + gy * m.tile;
        let img;
        if (s.textures.exists('Cavetile_wall_T')) {
            img = s.add.image(x, y, 'Cavetile_wall_T').setDisplaySize(m.tile, m.tile);
        } else {
            img = s.add.rectangle(x, y, m.tile, m.tile, 0x555555);
        }
        img.setScrollFactor(0).setDepth(975);
        try { s.cameras.main.ignore(img); } catch (e) {}
        this._demoTiles.push(img);
        this._demoCells.set(k, img);
        return img;
    }

    /** (用户) demo 自动贴皮 — 与 CavetileWall.renderSkins 同一套规则:
     *  dist=1 按四邻空气选 T/TR/TB/TRB/TRBL + 角度; dist>=2 用 2L. 格外视为墙 (边缘不外露). */
    _demoReskinCells() {
        const s = this.scene, m = this._demoGridMeta, cells = this._demoCells;
        if (!m || !cells) return;
        const inB = (gx, gy) => gx >= 0 && gx < m.cols && gy >= 0 && gy < m.rows;
        const isAir = (gx, gy) => inB(gx, gy) && !cells.has(gx + ',' + gy);
        const dist = new Map(); const q = [];
        for (const k of cells.keys()) {
            const [gx, gy] = k.split(',').map(Number);
            if (isAir(gx - 1, gy) || isAir(gx + 1, gy) || isAir(gx, gy - 1) || isAir(gx, gy + 1)) {
                dist.set(k, 1); q.push([gx, gy]);
            }
        }
        while (q.length) {
            const [cx0, cy0] = q.shift(); const d = dist.get(cx0 + ',' + cy0);
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
                const k2 = (cx0 + dx) + ',' + (cy0 + dy);
                if (cells.has(k2) && (dist.get(k2) || 99) > d + 1) { dist.set(k2, d + 1); q.push([cx0 + dx, cy0 + dy]); }
            });
        }
        for (const [k, img] of cells) {
            const [gx, gy] = k.split(',').map(Number);
            const d = dist.get(k) || 9;
            let tex = null, ang = 0;
            if (d === 1) {
                const t = isAir(gx, gy - 1), r = isAir(gx + 1, gy), b = isAir(gx, gy + 1), l = isAir(gx - 1, gy);
                const n = (t ? 1 : 0) + (r ? 1 : 0) + (b ? 1 : 0) + (l ? 1 : 0);
                if (n === 4) tex = 'Cavetile_wall_TRBL';
                else if (n === 3) { tex = 'Cavetile_wall_TRB'; ang = !l ? 0 : (!t ? 90 : (!r ? 180 : 270)); }
                else if (n === 2) {
                    if (t && b) { tex = 'Cavetile_wall_TB'; ang = 0; }
                    else if (r && l) { tex = 'Cavetile_wall_TB'; ang = 90; }
                    else if (t && r) { tex = 'Cavetile_wall_TR'; ang = 0; }
                    else if (r && b) { tex = 'Cavetile_wall_TR'; ang = 90; }
                    else if (b && l) { tex = 'Cavetile_wall_TR'; ang = 180; }
                    else { tex = 'Cavetile_wall_TR'; ang = 270; }
                } else if (n === 1) { tex = 'Cavetile_wall_T'; ang = t ? 0 : (r ? 90 : (b ? 180 : 270)); }
                else tex = 'Cavetile_wall_2L';
            } else tex = 'Cavetile_wall_2L';
            if (!tex || !s.textures.exists(tex)) {
                tex = ['Cavetile_wall_3L1', 'Cavetile_wall_2L', 'Cavetile_wall_T'].find(kk => s.textures.exists(kk));
            }
            if (tex && img.setTexture) { img.setTexture(tex); img.setDisplaySize(m.tile, m.tile); img.setAngle(ang); }
        }
    }

    /** Checkpoint 演示: 玩家走到神像旁 → HP 条上升 + Corrosion 条下降 → 循环 */
    _demoCheckpoint(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx, playerY = ctx.playerY;

        // 玩家先放左边, 神像放右边
        sprite.x = cx - 110;
        sprite.y = playerY;
        if (s.anims.exists('idle')) sprite.play('idle');

        // 神像 sprite (单帧 unactivated)
        const cpTex = s.textures.exists('Checkpoint_activated') ? 'Checkpoint_activated' :
                     (s.textures.exists('Checkpoint_unactivated') ? 'Checkpoint_unactivated' : null);
        if (cpTex) {
            this._demoCheckpointSprite = s.add.sprite(cx + 90, playerY - 5, cpTex)
                .setDisplaySize(120, 120)
                .setScrollFactor(0).setDepth(975);
            try { s.cameras.main.ignore(this._demoCheckpointSprite); } catch(e) {}
            if (cpTex === 'Checkpoint_activated' && s.anims.exists('checkpoint_activated')) {
                this._demoCheckpointSprite.play('checkpoint_activated');
            }
        } else {
            this._demoCheckpointSprite = s.add.rectangle(cx + 90, playerY - 5, 80, 110, 0xaaccff)
                .setStrokeStyle(2, 0x6688aa).setScrollFactor(0).setDepth(975);
            try { s.cameras.main.ignore(this._demoCheckpointSprite); } catch(e) {}
        }

        // HP 条 (红, 上半) + Corrosion 条 (紫, 下半)
        const barX = cx - 130;
        const barW = 220;
        const barH = 18;
        const hpY = playerY + 80;
        const corY = playerY + 110;

        this._demoHpBg = s.add.rectangle(barX, hpY, barW, barH, 0x222222, 0.85)
            .setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff).setScrollFactor(0).setDepth(975);
        this._demoHpFill = s.add.rectangle(barX + 2, hpY, 0, barH - 4, 0xdd2222, 1)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(976);
        this._demoHpLabel = s.add.text(barX, hpY - 18, 'HP', {
            fontSize: '14px', color: '#ff8888', fontFamily: '"VT323", monospace'
        }).setScrollFactor(0).setDepth(976);

        this._demoCorBg = s.add.rectangle(barX, corY, barW, barH, 0x222222, 0.85)
            .setOrigin(0, 0.5).setStrokeStyle(2, 0xaa6688).setScrollFactor(0).setDepth(975);
        this._demoCorFill = s.add.rectangle(barX + 2, corY, (barW - 4) * 0.6, barH - 4, 0xcc4477, 1)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(976);
        this._demoCorLabel = s.add.text(barX, corY - 18, 'Corrosion', {
            fontSize: '14px', color: '#ff88aa', fontFamily: '"VT323", monospace'
        }).setScrollFactor(0).setDepth(976);

        [this._demoHpBg, this._demoHpFill, this._demoHpLabel,
         this._demoCorBg, this._demoCorFill, this._demoCorLabel].forEach(o => {
            try { s.cameras.main.ignore(o); } catch(e) {}
        });

        // (用户) 神像回血治疗动画 — healing_anim 只在主矿洞 create 注册, guide 场景没跑那段 → 用点现注册并在玩家身上循环播
        if (s.textures.exists('Healing')) {
            if (!s.anims.exists('healing_anim')) {
                try { s.anims.create({ key: 'healing_anim', frames: s.anims.generateFrameNumbers('Healing', { start: 0, end: 9 }), frameRate: 14, repeat: -1 }); } catch (e) {}
            }
            this._demoHealFx = s.add.sprite(sprite.x, sprite.y, 'Healing').setScrollFactor(0).setDepth(977);
            try { s.cameras.main.ignore(this._demoHealFx); } catch (e) {}
            if (s.anims.exists('healing_anim')) this._demoHealFx.play('healing_anim');
        }

        // 初始: HP 30%, Corrosion 60%. 然后 HP 涨满, Corrosion 减到 0
        let hpPct = 0.3, corPct = 0.6;
        this._demoHpFill.width = (barW - 4) * hpPct;
        this._demoCorFill.width = (barW - 4) * corPct;

        const tick = () => {
            if (!this._demoHpFill || !this._demoHpFill.scene) return;
            hpPct = Math.min(1, hpPct + 0.07);
            corPct = Math.max(0, corPct - 0.07);
            this._demoHpFill.width = (barW - 4) * hpPct;
            this._demoCorFill.width = (barW - 4) * corPct;
            if (hpPct >= 1 && corPct <= 0) {
                // 重置循环
                const t = s.time.delayedCall(1200, () => {
                    hpPct = 0.3; corPct = 0.6;
                    if (this._demoHpFill && this._demoHpFill.scene) {
                        this._demoHpFill.width = (barW - 4) * hpPct;
                        this._demoCorFill.width = (barW - 4) * corPct;
                    }
                    tick();
                });
                this._demoTimers.push(t);
            } else {
                const t = s.time.delayedCall(280, tick);
                this._demoTimers.push(t);
            }
        };
        tick();
    }

    /** Thorn 演示: 玩家走过荆棘 → 扣血 (HP 降 + 红闪 + -5) + 加侵蚀度 (Corrosion 升 + +1%) → 循环 */
    _demoThorn(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx, playerY = ctx.playerY, groundTopY = ctx.groundTopY;

        // 荆棘带 (3 格, 优先 Thorns 贴图; fallback 暗红尖刺三角)
        const T = 44;
        this._demoThornTiles = [];   // (用户) 可播动画的荆棘 tile (走过时摆动)
        [cx - T, cx, cx + T].forEach(tx => {
            let sp;
            if (s.textures.exists('Thorns')) {
                // (用户) 演示荆棘改 sprite + 幂等注册 thorns_move — 玩家经过时播摆动动画 (与游戏一致)
                if (s.textures.exists('Thorns_move') && s.anims && !s.anims.exists('thorns_move')) {
                    const _ft = s.textures.get('Thorns_move').frameTotal;
                    s.anims.create({ key: 'thorns_move', frames: s.anims.generateFrameNumbers('Thorns_move', { start: 0, end: Math.max(0, _ft - 2) }), frameRate: 20, repeat: 0 });
                }
                sp = s.add.sprite(tx, groundTopY - T / 2 + 4, 'Thorns').setDisplaySize(T, T);
                if (s.anims.exists('thorns_move')) this._demoThornTiles.push(sp);
            } else {
                sp = s.add.triangle(tx, groundTopY + 2, -16, 0, 16, 0, 0, -30, 0x992233).setOrigin(0.5, 1);
            }
            sp.setScrollFactor(0).setDepth(974);
            try { s.cameras.main.ignore(sp); } catch(e) {}
            this._demoTiles.push(sp);
        });

        // HP / Corrosion 条 (与 checkpoint 演示同款, 清理函数已覆盖这些字段)
        const barX = cx - 130, barW = 220, barH = 18;
        const hpY = playerY + 80, corY = playerY + 110;
        this._demoHpBg = s.add.rectangle(barX, hpY, barW, barH, 0x222222, 0.85)
            .setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff).setScrollFactor(0).setDepth(975);
        this._demoHpFill = s.add.rectangle(barX + 2, hpY, barW - 4, barH - 4, 0xdd2222, 1)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(976);
        this._demoHpLabel = s.add.text(barX, hpY - 18, 'HP', {
            fontSize: '14px', color: '#ff8888', fontFamily: '"VT323", monospace'
        }).setScrollFactor(0).setDepth(976);
        this._demoCorBg = s.add.rectangle(barX, corY, barW, barH, 0x222222, 0.85)
            .setOrigin(0, 0.5).setStrokeStyle(2, 0xaa6688).setScrollFactor(0).setDepth(975);
        this._demoCorFill = s.add.rectangle(barX + 2, corY, 0, barH - 4, 0xcc4477, 1)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(976);
        this._demoCorLabel = s.add.text(barX, corY - 18, 'Corrosion', {
            fontSize: '14px', color: '#ff88aa', fontFamily: '"VT323", monospace'
        }).setScrollFactor(0).setDepth(976);
        [this._demoHpBg, this._demoHpFill, this._demoHpLabel,
         this._demoCorBg, this._demoCorFill, this._demoCorLabel].forEach(o => {
            try { s.cameras.main.ignore(o); } catch(e) {}
        });

        let hpPct = 1.0, corPct = 0.0;
        const setBars = () => {
            if (!this._demoHpFill || !this._demoHpFill.scene) return;
            this._demoHpFill.width = (barW - 4) * hpPct;
            this._demoCorFill.width = (barW - 4) * corPct;
        };
        setBars();

        const floatText = (txt, color, ox) => {
            const ft = s.add.text(sprite.x + ox, sprite.y - 60, txt, {
                fontSize: '18px', color, fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 3
            }).setOrigin(0.5).setScrollFactor(0).setDepth(978);
            try { s.cameras.main.ignore(ft); } catch(e) {}
            s.tweens.add({ targets: ft, y: ft.y - 34, alpha: 0, duration: 700, ease: 'Quad.easeOut',
                onComplete: () => { try { ft.destroy(); } catch(e) {} } });
        };

        const dmgTick = () => {
            if (!this._animSprite) return;
            hpPct = Math.max(0, hpPct - 0.10);
            corPct = Math.min(1, corPct + 0.08);
            setBars();
            sprite.setTint(0xff6666);
            const tc = s.time.delayedCall(130, () => { if (sprite.scene) sprite.clearTint(); });
            this._demoTimers.push(tc);
            floatText('-5', '#ff5555', -16);
            floatText('+1% Corrosion', '#dd66aa', 34);
        };

        const startX = cx - 160, endX = cx + 160;
        const playThorn = () => {
            if (!this._animSprite) return;
            sprite.setPosition(startX, playerY).setFlipX(false).clearTint();
            hpPct = 1.0; corPct = 0.0; setBars();
            if (s.anims.exists('run')) sprite.play('run');
            // 走过荆棘带 (|x-cx|<78) 期间每 450ms 一跳伤害
            const tickEv = s.time.addEvent({ delay: 450, repeat: 6, callback: () => {
                if (!this._animSprite || !sprite.scene) return;
                if (Math.abs(sprite.x - cx) < 78) dmgTick();
            }});
            this._demoTimers.push(tickEv);
            s.tweens.add({ targets: sprite, x: endX, duration: 2600, ease: 'Linear',
                onUpdate: () => {
                    // (用户) 玩家在荆棘带 (|x-cx|<78) 内 → tile 循环播摆动; 离开后播完回静态图
                    // (用户) 改按每个 tile 自身位置判定 — 演示玩家走到哪个荆棘附近, 哪个才播 (自然先后顺序, 不再 3 个一起)
                    (this._demoThornTiles || []).forEach(tp => {
                        if (!tp || !tp.scene || !tp.anims) return;
                        const nearThis = Math.abs(sprite.x - tp.x) < 30;
                        if (nearThis) {
                            if (!tp.anims.isPlaying) tp.play('thorns_move');
                        } else if (!tp.anims.isPlaying && tp.texture && tp.texture.key === 'Thorns_move') {
                            tp.setTexture('Thorns');
                            tp.setDisplaySize(44, 44);
                        }
                    });
                },
                onComplete: () => {
                if (!this._animSprite) return;
                if (s.anims.exists('idle')) sprite.play('idle');
                // (用户) 与游戏一致: 离开荆棘后还有 DoT — 每秒 -1 HP × 3 秒 (只扣血, 不加腐蚀)
                for (let i = 1; i <= 3; i++) {
                    const td = s.time.delayedCall(i * 1000, () => {
                        if (!this._animSprite || !sprite.scene) return;
                        hpPct = Math.max(0, hpPct - 0.02);
                        setBars();
                        sprite.setTint(0xff6666);
                        const tc2 = s.time.delayedCall(120, () => { if (sprite.scene) sprite.clearTint(); });
                        this._demoTimers.push(tc2);
                        floatText('-1', '#ff5555', 0);
                    });
                    this._demoTimers.push(td);
                }
                const t = s.time.delayedCall(4400, playThorn);
                this._demoTimers.push(t);
            }});
        };
        playThorn();
    }

    /** Detector 演示: Corrosion 条上涨 → 满时玩家闪红 (代表扣血) → 循环 */
    _demoDetector(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx, playerY = ctx.playerY;

        sprite.x = cx;
        sprite.y = playerY;
        if (s.anims.exists('idle')) sprite.play('idle');

        // 仪器 icon (健康侦测仪)
        if (s.textures.exists('health_detector_img')) {
            this._demoDetectorIcon = s.add.image(cx + 110, playerY - 30, 'health_detector_img')
                .setDisplaySize(48, 48).setScrollFactor(0).setDepth(976);
            try { s.cameras.main.ignore(this._demoDetectorIcon); } catch(e) {}
        }

        // Corrosion 条
        const barX = cx - 130;
        const barW = 220;
        const barH = 20;
        const corY = playerY + 90;

        this._demoCorBg = s.add.rectangle(barX, corY, barW, barH, 0x222222, 0.85)
            .setOrigin(0, 0.5).setStrokeStyle(2, 0xaa6688).setScrollFactor(0).setDepth(975);
        this._demoCorFill = s.add.rectangle(barX + 2, corY, 0, barH - 4, 0x884466, 1)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(976);
        this._demoCorLabel = s.add.text(barX, corY - 20, 'Corrosion', {
            fontSize: '14px', color: '#ff88aa', fontFamily: '"VT323", monospace'
        }).setScrollFactor(0).setDepth(976);

        [this._demoCorBg, this._demoCorFill, this._demoCorLabel].forEach(o => {
            try { s.cameras.main.ignore(o); } catch(e) {}
        });

        let corPct = 0;
        const tick = () => {
            if (!this._demoCorFill || !this._demoCorFill.scene) return;
            corPct += 0.08;
            if (corPct > 1) corPct = 1;
            this._demoCorFill.width = (barW - 4) * corPct;
            // 颜色渐变
            if (corPct < 0.2)      this._demoCorFill.fillColor = 0x884466;
            else if (corPct < 0.5) this._demoCorFill.fillColor = 0xcc4477;
            else                   this._demoCorFill.fillColor = 0xff3366;
            // 减速效果 — 玩家轻微抖动
            if (corPct > 0.3 && sprite.scene) {
                sprite.x = cx + Math.sin(s.time.now / 100) * (corPct * 4);
            }
            if (corPct >= 1) {
                // 闪红 (代表扣血)
                if (sprite.scene && sprite.setTint) {
                    sprite.setTint(0xff3333);
                    const t1 = s.time.delayedCall(200, () => {
                        if (sprite.scene && sprite.clearTint) sprite.clearTint();
                    });
                    this._demoTimers.push(t1);
                }
                // 重置
                const t = s.time.delayedCall(1500, () => {
                    corPct = 0;
                    if (this._demoCorFill && this._demoCorFill.scene) {
                        this._demoCorFill.width = 0;
                    }
                    tick();
                });
                this._demoTimers.push(t);
            } else {
                const t = s.time.delayedCall(400, tick);
                this._demoTimers.push(t);
            }
        };
        tick();
    }

    /** 平台演示：跳穿过平台落到上方 → 蹲下穿过平台落到下方 → 循环 */
    _demoPlatform(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx, playerY = ctx.playerY;
        const groundTopY = ctx.groundTopY;
        const TILE = 48;

        // platform 在 2.5 格高（让 3 格柱子瓷砖底紧贴地板瓷砖顶）
        const platformY = groundTopY - TILE * 2.5;
        const platformLen = 4;

        const platLeftTex = s.textures.exists('Platform_L') ? 'Platform_L' : (s.textures.exists('Platform_M') ? 'Platform_M' : null);
        const platRightTex = s.textures.exists('Platform_R') ? 'Platform_R' : (s.textures.exists('Platform_M') ? 'Platform_M' : null);
        // (用户) 起点吸附 demo 晶格, 柱子走自动贴皮 — 修复"皮肤不见了" (之前全用 2L 内层皮, 1 格宽外露柱该是 TB/TRB 边皮)
        const gx0 = ctx.colAt(cx - (platformLen * TILE) / 2 + TILE / 2);
        const startX = ctx.cellXOf(gx0);
        for (let r = ctx.floorRow - 3; r <= ctx.floorRow - 1; r++) {
            ctx.addWall(gx0, r);
            ctx.addWall(gx0 + platformLen - 1, r);
        }
        ctx.reskin();

        // 平台 2 格在中间（Platform_L Platform_R）
        const platforms = [];
        for (let i = 1; i < platformLen - 1; i++) {
            const px = startX + i * TILE;
            const skin = (i === 1) ? platLeftTex : platRightTex;
            if (skin) {
                const p = s.add.image(px, platformY, skin)
                    .setDisplaySize(TILE, TILE)
                    .setScrollFactor(0).setDepth(975);
                try { s.cameras.main.ignore(p); } catch(e) {}
                platforms.push(p);
                this._demoTiles.push(p);
            }
        }
        this._demoObstacle = platforms[0] || null;

        // 跳跃终点：站在 platform 上（脚位于 platformY，sprite 中心在 platformY - 47）
        // sprite 中心到脚的距离 = 47（与 playerY 计算一致）
        // platform 顶 edge = platformY - TILE/2 = platformY - 24
        // sprite.y 站在 platform 顶 = (platformY - 24) - 47 = platformY - 71
        const standOnPlatformY = platformY - 71;

        const playLoop = () => {
            if (!this._animSprite) return;
            sprite.x = cx;
            sprite.y = playerY;
            if (sprite.scene && s.anims.exists('jump')) sprite.play('jump');
            s.tweens.add({
                targets: sprite,
                y: standOnPlatformY,  // 站在 platform 上
                duration: 500,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    if (sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                    const t1 = s.time.delayedCall(1500, () => {
                        if (sprite.scene && s.anims.exists('crouch')) sprite.play('crouch');
                        // crouch 后立即开始 fall（不在空中悬浮）
                        if (sprite.scene && s.anims.exists('fall')) sprite.play('fall');
                        s.tweens.add({
                            targets: sprite,
                            y: playerY,
                            duration: 400,
                            ease: 'Quad.easeIn',
                            onComplete: () => {
                                if (sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                                const t3 = s.time.delayedCall(2000, playLoop);
                                this._demoTimers.push(t3);
                            }
                        });
                    });
                    this._demoTimers.push(t1);
                }
            });
        };

        playLoop();
    }

    /** 走路演示：右走 → 停 3s → 左走 → 停 3s → 循环 */
    _demoWalk(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx;
        const range = 100;
        let phase = 0;

        const playPhase = () => {
            if (!this._animSprite) return;
            phase = (phase + 1) % 4;
            if (phase === 0) {
                sprite.x = cx - range;
                sprite.setFlipX(false);
                if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run');
                this._demoTween = s.tweens.add({
                    targets: sprite,
                    x: cx + range,
                    duration: ctx.walkDur(range * 2),   // (用户) 1.5×
                    onComplete: () => {
                        if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                        const t = s.time.delayedCall(3000, playPhase);
                        this._demoTimers.push(t);
                    }
                });
            } else if (phase === 2) {
                sprite.setFlipX(true);
                if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run');
                this._demoTween = s.tweens.add({
                    targets: sprite,
                    x: cx - range,
                    duration: ctx.walkDur(range * 2),   // (用户) 1.5×
                    onComplete: () => {
                        if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                        const t = s.time.delayedCall(3000, playPhase);
                        this._demoTimers.push(t);
                    }
                });
            }
        };

        sprite.x = cx - range;
        sprite.setFlipX(false);
        if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
        phase = 3;
        const t = s.time.delayedCall(800, playPhase);
        this._demoTimers.push(t);
    }

    /** 跳跃演示：跳过障碍物 → 停 3s → 重置 → 重复 */
    _demoJump(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx;
        const playerY = ctx.playerY;
        const groundTopY = ctx.groundTopY;
        const startX = cx - 100;
        const endX = cx + 100;
        const peakY = playerY - 150;  // 2 格障碍（96px）+ 余量，确保视觉上明显跳过
        const TILE = 48;
        // (用户) 障碍吸附 demo 晶格 + 走自动贴皮 — 与地板连接处皮肤正确 (之前手贴 TRB/TB, 地板那格不跟着变)
        const obstacleX = ctx.cellXOf(ctx.colAt(cx));
        ctx.addWall(ctx.colAt(cx), ctx.floorRow - 1);
        ctx.addWall(ctx.colAt(cx), ctx.floorRow - 2);
        ctx.reskin();
        this._demoObstacle = null;

        // 不需要独立地面线（已经用 cavetile 瓷砖铺好了）

        const playJump = () => {
            if (!this._animSprite) return;

            // 重置到起点
            sprite.x = startX;
            sprite.y = playerY;
            sprite.setFlipX(false);
            if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run');

            // 走到接近障碍物（提早 5px 起跳）
            this._demoTween = s.tweens.add({
                targets: sprite,
                x: obstacleX - 55,
                duration: ctx.walkDur((obstacleX - 55) - startX),   // (用户) 1.5× 统一走速
                onComplete: () => {
                    // 跳：x 平移 + y 抛物线
                    if (sprite && sprite.scene && s.anims.exists('jump')) sprite.play('jump');
                    s.tweens.add({
                        targets: sprite,
                        x: obstacleX + 50,
                        duration: 552,  // (用户) 惯性 1.5× (828/1.5), 与 y 的 276×2 同长 → 弧线不变形
                        ease: 'Linear'
                    });
                    s.tweens.add({
                        targets: sprite,
                        y: peakY,
                        duration: 276,  // (用户) 整段跳跃 1.5× (414/1.5); 弧形与 x 同步
                        ease: 'Quad.easeOut',
                        yoyo: true,
                        onYoyo: () => {
                            if (sprite && sprite.scene && s.anims.exists('fall')) sprite.play('fall');
                        },
                        onComplete: () => {
                            sprite.y = playerY;
                            if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run');
                            s.tweens.add({
                                targets: sprite,
                                x: endX,
                                duration: ctx.walkDur(endX - (obstacleX + 50)),   // (用户) 1.5× 统一走速
                                onComplete: () => {
                                    if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                                    const t = s.time.delayedCall(3000, playJump);
                                    this._demoTimers.push(t);
                                }
                            });
                        }
                    });
                }
            });
        };

        // 启动
        playJump();
    }

    /** 挖掘演示：走向水晶 → 攻击 3 下 → 水晶碎 → 走过去拾起 → 停 → 重复 */
    _demoMine(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx;
        const playerY = ctx.playerY;
        const groundTopY = ctx.groundTopY;
        const startX = cx - 110;
        const crystalBaseX = cx + 30;

        // 水晶矿石（用 Crystal_block_1 皮肤，显示 48×48 = 1 wall 大小）
        const crystalBlockTex = s.textures.exists('Crystal_block_1') ? 'Crystal_block_1' : null;
        const crystalY = groundTopY - 24;
        const crystal = crystalBlockTex
            ? s.add.image(crystalBaseX, crystalY, crystalBlockTex).setDisplaySize(48, 48)
            : s.add.rectangle(crystalBaseX, crystalY, 48, 48, 0x44ddff).setStrokeStyle(2, 0x00aacc);
        crystal.setScrollFactor(0).setDepth(975);
        try { s.cameras.main.ignore(crystal); } catch(e) {}
        this._demoCrystal = crystal;

        // 掉落水晶（用于拾起阶段）
        let dropCrystal = null;

        const playMine = () => {
            if (!this._animSprite) return;

            sprite.x = startX;
            sprite.y = playerY;
            sprite.setFlipX(false);
            // 清旧的 tween（避免重复爆裂动画残留）
            s.tweens.killTweensOf(crystal);
            crystal.setVisible(true).setAlpha(1).setPosition(crystalBaseX, crystalY);
            crystal.clearTint();
            if (dropCrystal) { dropCrystal.destroy(); dropCrystal = null; }
            if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');

            this._demoTween = s.tweens.add({
                targets: sprite,
                x: crystalBaseX - 50,
                duration: ctx.walkDur((crystalBaseX - 50) - startX),   // (用户) 1.5× 统一走速
                onStart: () => { if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run'); },
                onComplete: () => {
                    if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                    let hits = 0;
                    const doHit = () => {
                        if (!this._animSprite) return;
                        hits++;
                        if (sprite && sprite.scene && s.anims.exists('melee_attack')) {
                            sprite.play('melee_attack');
                        }
                        s.tweens.add({
                            targets: crystal,
                            x: crystalBaseX + 4,
                            duration: 60,
                            yoyo: true
                        });
                        if (hits < 3) {
                            const t = s.time.delayedCall(450, doHit);
                            this._demoTimers.push(t);
                        } else {
                            // (用户) 与游戏一致: 第 3 下命中立即碎 + 掉落 (移除变色抖动延迟)
                            const t = s.time.delayedCall(0, () => {
                                if (!this._animSprite) return;
                                crystal.setVisible(false);
                                crystal.clearTint();
                                const dropTex = s.textures.exists('Crystal') ? 'Crystal' : (s.textures.exists('drop_crystal_img') ? 'drop_crystal_img' : null);   // (用户) 掉落水晶用真皮肤
                                if (dropTex) {
                                    dropCrystal = s.add.image(crystalBaseX, crystalY, dropTex)
                                        .setDisplaySize(20, 20).setScrollFactor(0).setDepth(975);
                                } else {
                                    dropCrystal = s.add.rectangle(crystalBaseX, crystalY, 18, 18, 0x44ddff)
                                        .setScrollFactor(0).setDepth(975);
                                }
                                try { s.cameras.main.ignore(dropCrystal); } catch(e) {}
                                this._demoDrop = dropCrystal;
                                s.tweens.add({
                                    targets: dropCrystal,
                                    y: crystalY - 25,
                                    duration: 200,
                                    yoyo: true,
                                    ease: 'Quad.easeOut'
                                });
                                s.tweens.add({ targets: dropCrystal, angle: 360, duration: 400, ease: 'Linear' });   // (用户) 与游戏一致: 空中转一圈

                                if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run');
                                // 玩家走过去
                                s.tweens.add({
                                    targets: sprite,
                                    x: crystalBaseX,
                                    duration: ctx.walkDur(50),   // (用户) 1.5× 统一走速
                                    onComplete: () => {
                                        if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                                        const t2 = s.time.delayedCall(3000, playMine);
                                        this._demoTimers.push(t2);
                                    }
                                });
                                // 玩家走到一半时，水晶飞向玩家
                                const tFly = s.time.delayedCall(250, () => {
                                    if (!dropCrystal || !dropCrystal.scene) return;
                                    s.tweens.killTweensOf(dropCrystal);
                                    s.tweens.add({
                                        targets: dropCrystal,
                                        x: () => sprite.x,
                                        y: () => sprite.y,
                                        scale: 0.5,
                                        duration: 250,
                                        ease: 'Cubic.easeIn',
                                        onComplete: () => {
                                            if (dropCrystal) { dropCrystal.destroy(); dropCrystal = null; }
                                        }
                                    });
                                });
                                this._demoTimers.push(tFly);
                            });
                            this._demoTimers.push(t);
                        }
                    };
                    const t = s.time.delayedCall(400, doHit);
                    this._demoTimers.push(t);
                }
            });
        };

        playMine();
    }

    /** #9 投掷/收回战斗演示: 丢稿子砸蝙蝠 → 收回 → 再丢 → 蝙蝠死 → 掉晶体 → 走过去捡 → 停 5s → 循环 */
    _demoThrowCombat(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx, playerY = ctx.playerY, groundTopY = ctx.groundTopY;
        const startX = cx - 120;
        const batX = cx + 85;
        const batY = groundTopY - 70;   // 蝙蝠在空中

        // 蝙蝠
        const batTex = s.textures.exists('Bat_fly') ? 'Bat_fly' : null;
        let bat;
        if (batTex) {
            bat = s.add.sprite(batX, batY, batTex).setScale(1.3).setScrollFactor(0).setDepth(975);
            if (s.anims.exists('bat_fly') && bat.play) bat.play('bat_fly');
        } else {
            bat = s.add.rectangle(batX, batY, 34, 22, 0x5566aa).setScrollFactor(0).setDepth(975);
        }
        try { s.cameras.main.ignore(bat); } catch(e) {}
        this._demoEnemy = bat;

        // 稿子投掷物 (优先 Pickaxe, 否则黄块)
        const pickTex = s.textures.exists('Pickaxe') ? 'Pickaxe' : (s.textures.exists('pickaxe_img') ? 'pickaxe_img' : null);
        const pick = pickTex
            ? s.add.image(startX, playerY - 6, pickTex).setDisplaySize(24, 24)
            : s.add.rectangle(startX, playerY - 6, 16, 16, 0xffff00);
        pick.setScrollFactor(0).setDepth(977).setVisible(false);
        try { s.cameras.main.ignore(pick); } catch(e) {}
        this._demoPick = pick;

        let dropCrystal = null;
        const handX = () => sprite.x;   // (用户) 绳连接点 = 玩家中心
        const handY = () => sprite.y;

        // (用户) 绳子: 与实际游戏一致, 稿子飞出/收回全程画绳 (巧克力色)
        const ropeG = s.add.graphics().setScrollFactor(0).setDepth(975);   // (用户) 绳渲染优先级低于玩家 (976)
        try { s.cameras.main.ignore(ropeG); } catch(e) {}
        this._demoRope = ropeG;
        const drawRope = () => {
            if (!ropeG || !ropeG.scene) return;
            ropeG.clear();
            if (pick.visible) {
                ropeG.lineStyle(2, 0xD2691E, 0.85);
                ropeG.lineBetween(handX(), handY(), pick.x, pick.y);
            }
        };

        const fly = (toX, toY, dur, spin, ease, onDone) => {
            pick.setVisible(true);
            s.tweens.add({ targets: pick, x: toX, y: toY, angle: '+=' + spin, duration: dur, ease: ease, onUpdate: drawRope, onComplete: onDone });
        };

        const playCombat = () => {
            if (!this._animSprite) return;
            s.tweens.killTweensOf(bat); s.tweens.killTweensOf(pick);
            sprite.x = startX; sprite.y = playerY; sprite.setFlipX(false);
            if (sprite.scene && s.anims.exists('idle')) sprite.play('idle');
            bat.setVisible(true).setAlpha(1).setAngle(0).setPosition(batX, batY).clearTint();
            if (batTex && s.anims.exists('bat_fly') && bat.play) bat.play('bat_fly');
            pick.setVisible(false).setAngle(0).setPosition(handX(), handY());
            drawRope();
            if (dropCrystal) { try { dropCrystal.destroy(); } catch(e) {} dropCrystal = null; }

            const throw1 = () => {
                if (!this._animSprite) return;
                pick.setPosition(handX(), handY()).setAngle(0);
                fly(batX, batY, 300, 720, 'Quad.easeIn', () => {
                    bat.setTint(0xff6666);
                    const tc = s.time.delayedCall(110, () => { if (bat.scene) bat.clearTint(); }); this._demoTimers.push(tc);
                    fly(handX(), handY(), 280, 360, 'Quad.easeOut', () => {
                        pick.setVisible(false);
                        drawRope();
                        const t = s.time.delayedCall(380, throw2); this._demoTimers.push(t);
                    });
                });
            };
            const throw2 = () => {
                if (!this._animSprite) return;
                pick.setPosition(handX(), handY()).setAngle(0);
                fly(batX, batY, 300, 720, 'Quad.easeIn', () => {
                    // 第 2 下 — 蝙蝠死: 变灰 + 坠落
                    bat.setTint(0x555555);
                    if (batTex && s.anims.exists('bat_dead') && bat.play) bat.play('bat_dead');
                    s.tweens.add({ targets: bat, y: groundTopY - 12, angle: 100, alpha: 0.25, duration: 420, ease: 'Quad.easeIn' });
                    fly(handX(), handY(), 280, 360, 'Quad.easeOut', () => {
                        pick.setVisible(false);
                        drawRope();
                        dropAndPickup();
                    });
                });
            };
            const dropAndPickup = () => {
                if (!this._animSprite) return;
                const dropTex = s.textures.exists('Crystal') ? 'Crystal' : (s.textures.exists('drop_crystal_img') ? 'drop_crystal_img' : null);   // (用户) 掉落水晶用真皮肤
                const dcx = batX, dcy = groundTopY - 12;
                dropCrystal = dropTex
                    ? s.add.image(dcx, dcy, dropTex).setDisplaySize(20, 20)
                    : s.add.rectangle(dcx, dcy, 18, 18, 0x44ddff);
                dropCrystal.setScrollFactor(0).setDepth(975);
                try { s.cameras.main.ignore(dropCrystal); } catch(e) {}
                this._demoDrop = dropCrystal;
                s.tweens.add({ targets: dropCrystal, y: dcy - 22, duration: 220, yoyo: true, ease: 'Quad.easeOut' });
                s.tweens.add({ targets: dropCrystal, angle: 360, duration: 440, ease: 'Linear' });   // (用户) 空中转一圈
                // 玩家走过去
                if (sprite.scene && s.anims.exists('run')) sprite.play('run');
                s.tweens.add({ targets: sprite, x: dcx - 32, duration: ctx.walkDur((dcx - 32) - sprite.x), onComplete: () => {   // (用户) 1.5× 统一走速
                    if (sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                    const t2 = s.time.delayedCall(5000, playCombat); this._demoTimers.push(t2);   // 停 5s 后循环
                }});
                // 走到一半晶体飞向玩家
                const tFly = s.time.delayedCall(400, () => {
                    if (!dropCrystal || !dropCrystal.scene) return;
                    s.tweens.killTweensOf(dropCrystal);
                    s.tweens.add({ targets: dropCrystal, x: () => sprite.x, y: () => sprite.y, scale: 0.5, duration: 260, ease: 'Cubic.easeIn', onComplete: () => { if (dropCrystal) { try { dropCrystal.destroy(); } catch(e) {} dropCrystal = null; } } });
                });
                this._demoTimers.push(tFly);
            };

            const t0 = s.time.delayedCall(450, throw1); this._demoTimers.push(t0);
        };

        playCombat();
    }

    /** 进阶移动演示: 投稿子入墙 → 左键收绳飞向墙 → 墙间荡 → S 蹲 → F 换手 → 落地循环 */
    _demoAdvMove(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx, playerY = ctx.playerY, groundTopY = ctx.groundTopY;
        const animLeft = ctx.animLeft, animRight = ctx.animRight;
        const TILE = 48;
        const ceilingY = (typeof this._demoCeilingY === 'number') ? this._demoCeilingY : (playerY - 160);

        // === (用户) 左右墙走 demo 自动贴皮格子 — 与上下排在角落正确连接 ===
        const leftWallX  = ctx.cellXOf(0);
        const rightWallX = ctx.cellXOf(ctx.gridCols - 1);
        for (let r = 1; r <= ctx.floorRow - 1; r++) { ctx.addWall(0, r); ctx.addWall(ctx.gridCols - 1, r); }
        ctx.reskin();

        // 锚点 (墙内侧面靠上): 玩家飞行终点 = 稿子上 ((用户) 修正: 之前飞到稿子下面/飞歪)
        const anchorR = { x: rightWallX - TILE / 2 + 8, y: ceilingY + 46 };
        const anchorL = { x: leftWallX  + TILE / 2 - 8, y: ceilingY + 46 };
        const atR = { x: anchorR.x - 26, y: anchorR.y };   // 到达点: 紧贴稿子 (同高)
        const atL = { x: anchorL.x + 26, y: anchorL.y };
        const CROUCH_DY = 24;   // (用户) 蹲下身体只剩 1.5 格 → 贴图下沉半格贴地 (0.5世界格×1.5显示比)
        const floorStart = { x: cx, y: playerY };

        // 绳子 graphics (与实际游戏一致: 巧克力色 2px) — 支持同时多条 (左稿未收回时两条)
        const rope = s.add.graphics().setScrollFactor(0).setDepth(975);
        try { s.cameras.main.ignore(rope); } catch(e) {}
        this._demoRope = rope;

        const mkPick = () => {
            const pickTex = s.textures.exists('Pickaxe') ? 'Pickaxe' : (s.textures.exists('pickaxe_img') ? 'pickaxe_img' : null);
            const p = pickTex
                ? s.add.image(floorStart.x, playerY - 6, pickTex).setDisplaySize(24, 24)
                : s.add.rectangle(floorStart.x, playerY - 6, 16, 16, 0xffff00);
            p.setScrollFactor(0).setDepth(977).setVisible(false);
            try { s.cameras.main.ignore(p); } catch(e) {}
            return p;
        };
        const pick1 = mkPick(); this._demoPick = pick1;
        const pick2 = mkPick(); this._demoTiles.push(pick2);

        const handX = () => sprite.x;   // (用户) 绳子连接点 = 玩家中心
        const handY = () => sprite.y + ((sprite.anims && sprite.anims.currentAnim && sprite.anims.currentAnim.key === 'crouch') ? 16 : 0);   // (用户) 蹲姿身体下沉 → 绳连本体中心
        const attached = [];   // 已钉墙锚点 — 每帧每条绳画到手上
        const drawRopes = (extra) => {
            if (!rope || !rope.scene) return;
            rope.clear();
            rope.lineStyle(2, 0xD2691E, 0.85);
            attached.forEach(a => rope.lineBetween(handX(), handY(), a.x, a.y));
            if (extra) rope.lineBetween(handX(), handY(), extra.x, extra.y);   // 飞行中/收回中的稿子
        };

        const throwPick = (pk, anchor, faceRight, onStick) => {
            if (!this._animSprite) return;
            sprite.setFlipX(!faceRight);
            pk.setVisible(true).setPosition(handX(), handY()).setAngle(0);
            s.tweens.add({
                targets: pk, x: anchor.x, y: anchor.y,
                angle: faceRight ? 450 : -450, duration: 320, ease: 'Quad.easeIn',
                onUpdate: () => drawRopes(pk),
                onComplete: () => {
                    if (!this._animSprite) return;
                    attached.push(anchor); drawRopes();
                    onStick();
                }
            });
        };
        const flyTo = (target, onDone) => {
            if (!this._animSprite) return;
            if (s.anims.exists('jump')) sprite.play('jump');
            s.tweens.add({
                targets: sprite, x: target.x, y: target.y, duration: 540, ease: 'Quad.easeOut',
                onUpdate: () => drawRopes(),
                onComplete: () => { drawRopes(); if (onDone) onDone(); }
            });
        };
        const fallTo = (gx, gy, onDone) => {
            if (!this._animSprite) return;
            if (s.anims.exists('fall')) sprite.play('fall');
            s.tweens.add({
                targets: sprite, x: gx, y: gy, duration: 430, ease: 'Quad.easeIn',
                onUpdate: () => drawRopes(),
                onComplete: () => { drawRopes(); if (onDone) onDone(); }
            });
        };
        const collect = (pk, anchor, onDone) => {   // 该稿收回到手 (它的绳跟着回来后消失)
            const i = attached.indexOf(anchor); if (i >= 0) attached.splice(i, 1);
            s.tweens.add({
                targets: pk, x: handX(), y: handY(), angle: '+=200', duration: 260, ease: 'Quad.easeOut',
                onUpdate: () => drawRopes(pk),
                onComplete: () => { pk.setVisible(false); drawRopes(); if (onDone) onDone(); }
            });
        };
        const showKey = (label, onDone) => {
            const fk = s.add.text(sprite.x, sprite.y - 64, label, {
                fontFamily: 'monospace', fontSize: '24px', color: '#ffffff',
                backgroundColor: '#222222', padding: { x: 7, y: 3 }
            }).setOrigin(0.5).setScrollFactor(0).setDepth(978);
            try { s.cameras.main.ignore(fk); } catch(e) {}
            this._demoFKey = fk;
            fk.setScale(0.5);
            s.tweens.add({ targets: fk, scale: 1, duration: 170, ease: 'Back.easeOut' });
            const t = s.time.delayedCall(620, () => {
                if (this._demoFKey && this._demoFKey.scene) this._demoFKey.destroy();
                this._demoFKey = null;
                if (onDone) onDone();
            });
            this._demoTimers.push(t);
        };
        const wait = (ms, fn) => { const t = s.time.delayedCall(ms, () => { if (this._animSprite) fn(); }); this._demoTimers.push(t); };

        // === (用户新编排) ===
        // 1 丢右→飞到稿子上(全程站)→到达即收稿→掉下来落地
        // 2 演示 S 蹲下
        // 3 (保持蹲) 丢左→飞到稿子上→蹲挂
        // 4 演示 F 换手
        // 5 丢右 (左稿不收, 两条绳)→飞到右稿上→蹲挂
        // 6 演示 S → 站起掉落落地 + 收回挂着的右稿 (左绳保留)
        // 7 演示 F 换手 → RMB 右键 → 收回左稿
        // 8 停 5 秒 → 重新循环
        const playAdv = () => {
            if (!this._animSprite) return;
            s.tweens.killTweensOf(sprite); s.tweens.killTweensOf(pick1); s.tweens.killTweensOf(pick2);
            attached.length = 0;
            sprite.setPosition(floorStart.x, floorStart.y).setFlipX(false);
            if (s.anims.exists('idle')) sprite.play('idle');
            if (rope && rope.scene) rope.clear();
            pick1.setVisible(false).setAngle(0);
            pick2.setVisible(false).setAngle(0);

            // 1) 丢右墙 → 飞到稿子上 (全程站立) → 站着到达 = 稿子直接收回 → 掉下来落地
            const step1 = () => throwPick(pick1, anchorR, true, () => {
                flyTo(atR, () => {
                    collect(pick1, anchorR, null);
                    fallTo(atR.x - 8, floorStart.y, () => {
                        if (s.anims.exists('idle')) sprite.play('idle');
                        wait(2000, step2);   // (用户) 每步停 2 秒
                    });
                });
            });
            // 2) 演示 S 蹲下
            const step2 = () => showKey('S', () => {
                if (s.anims.exists('crouch')) sprite.play('crouch');
                sprite.y = floorStart.y + CROUCH_DY;   // 蹲姿贴地
                wait(2000, step3);
            });
            // 3) (保持蹲) 丢左墙 → 飞到稿子上 → 蹲挂
            const step3 = () => throwPick(pick1, anchorL, false, () => {
                flyTo(atL, () => {
                    if (s.anims.exists('crouch')) sprite.play('crouch');
                    sprite.y = atL.y + CROUCH_DY;   // 蹲姿下沉
                    wait(2000, step4);
                });
            });
            // 4) F 换手
            const step4 = () => showKey('F', () => wait(2000, step5));
            // 5) 丢右墙 (左稿不收回, 同时两条绳) → 飞到右稿上 → 蹲挂
            const step5 = () => throwPick(pick2, anchorR, true, () => {
                flyTo(atR, () => {
                    if (s.anims.exists('crouch')) sprite.play('crouch');
                    sprite.y = atR.y + CROUCH_DY;   // 蹲姿下沉
                    wait(2000, step6);
                });
            });
            // 6) S → 站起掉落落地 + 自动收回挂着的右稿 (左绳保留在墙上)
            const step6 = () => showKey('S', () => {
                collect(pick2, anchorR, null);
                fallTo(atR.x - 8, floorStart.y, () => {
                    if (s.anims.exists('idle')) sprite.play('idle');
                    wait(2000, step7);
                });
            });
            // 7) F 换手 → 右键 → 收回左稿
            const step7 = () => showKey('F', () => wait(2000, () => showKey('RMB', () => {
                sprite.setFlipX(true);   // 面向左稿
                collect(pick1, anchorL, () => {
                    sprite.setFlipX(false);
                    if (s.anims.exists('idle')) sprite.play('idle');
                    // 8) 停 5 秒 → 重新循环
                    wait(5000, playAdv);
                });
            })));

            wait(450, step1);
        };

        playAdv();
    }

    /** 攻击演示：走向蜘蛛 → 攻击 3 下击杀 → 重置 → 重复 */
    _demoAttack(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx;
        const playerY = ctx.playerY;
        const groundTopY = ctx.groundTopY;
        const startX = cx - 110;
        const enemyBaseX = cx + 50;

        // 蜘蛛 sprite（用 Small_spider_run，scale 0.7 → 显示 ~45px）
        const enemyTex = s.textures.exists('Small_spider_run') ? 'Small_spider_run' : null;
        const enemyY = groundTopY - 13;
        let enemy;
        if (enemyTex) {
            enemy = s.add.sprite(enemyBaseX, enemyY, enemyTex);
            enemy.setScale(1.0).setScrollFactor(0).setDepth(975);
            if (s.anims.exists('small_spider_run')) enemy.play('small_spider_run');
        } else {
            enemy = s.add.rectangle(enemyBaseX, enemyY, 32, 24, 0x8800ff)
                .setScrollFactor(0).setDepth(975);
        }
        try { s.cameras.main.ignore(enemy); } catch(e) {}
        this._demoEnemy = enemy;

        const playAttack = () => {
            if (!this._animSprite) return;

            // 先 stop 旧 fade tween（避免覆盖 alpha=1）
            s.tweens.killTweensOf(enemy);

            sprite.x = startX;
            sprite.y = playerY;
            sprite.setFlipX(false);
            enemy.setVisible(true).setAlpha(1).setPosition(enemyBaseX, enemyY);
            enemy.setFlipX(true);
            enemy.clearTint();  // 清死亡时的灰色
            if (s.anims.exists('small_spider_run') && enemy.play) enemy.play('small_spider_run');
            if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');

            // 走向蜘蛛
            this._demoTween = s.tweens.add({
                targets: sprite,
                x: enemyBaseX - 50,
                duration: ctx.walkDur((enemyBaseX - 50) - startX),   // (用户) 1.5× 统一走速
                onStart: () => { if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run'); },
                onComplete: () => {
                    if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                    let hits = 0;
                    // melee_attack 0-2 frames @ 20fps = 150ms 完成动作
                    const ATTACK_DURATION = 200;  // 动作时长（含余量）
                    const IDLE_BETWEEN = 250;     // 攻击之间 idle 间隔
                    const doHit = () => {
                        if (!this._animSprite) return;
                        hits++;
                        if (sprite && sprite.scene && s.anims.exists('melee_attack')) sprite.play('melee_attack');
                        // 蜘蛛闪红
                        enemy.setTint(0xff4444);
                        s.time.delayedCall(120, () => {
                            if (enemy && enemy.scene) enemy.clearTint();
                        });
                        // 攻击动作做完后切回 idle
                        const tIdle = s.time.delayedCall(ATTACK_DURATION, () => {
                            if (!this._animSprite) return;
                            if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                        });
                        this._demoTimers.push(tIdle);

                        if (hits < 3) {
                            // 等动作做完 + idle 间隔后再 doHit
                            const t = s.time.delayedCall(ATTACK_DURATION + IDLE_BETWEEN, doHit);
                            this._demoTimers.push(t);
                        } else {
                            // (用户) 第 3 下命中即死 (与游戏一致, 不再等攻击动作播完的 0.2s)
                            const tKill = s.time.delayedCall(0, () => {
                                if (!this._animSprite) return;
                                if (s.anims.exists('small_spider_dead') && enemy.play) {
                                    enemy.play('small_spider_dead');
                                }
                                enemy.setTint(0x555555);
                                s.tweens.add({
                                    targets: enemy,
                                    alpha: 0,
                                    duration: 400
                                });
                                // 蜘蛛死后掉落水晶（在蜘蛛位置）
                                const dropTex = s.textures.exists('Crystal') ? 'Crystal' : (s.textures.exists('drop_crystal_img') ? 'drop_crystal_img' : null);   // (用户) 掉落水晶用真皮肤
                                let attackDrop;
                                if (dropTex) {
                                    attackDrop = s.add.image(enemy.x, enemy.y, dropTex)
                                        .setDisplaySize(20, 20).setScrollFactor(0).setDepth(975);
                                } else {
                                    attackDrop = s.add.rectangle(enemy.x, enemy.y, 18, 18, 0x44ddff)
                                        .setScrollFactor(0).setDepth(975);
                                }
                                try { s.cameras.main.ignore(attackDrop); } catch(e) {}
                                this._demoDrop = attackDrop;
                                // 弹一下
                                s.tweens.add({
                                    targets: attackDrop,
                                    y: enemy.y - 20,
                                    duration: 200,
                                    yoyo: true,
                                    ease: 'Quad.easeOut'
                                });
                                s.tweens.add({ targets: attackDrop, angle: 360, duration: 400, ease: 'Linear' });   // (用户) 空中转一圈

                                // 玩家走过去
                                const tWalk = s.time.delayedCall(500, () => {
                                    if (!this._animSprite) return;
                                    if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run');
                                    s.tweens.add({
                                        targets: sprite,
                                        x: enemy.x,
                                        duration: ctx.walkDur(enemy.x - sprite.x),   // (用户) 1.5× 统一走速
                                        onComplete: () => {
                                            if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                                            // 重置等待
                                            const t = s.time.delayedCall(2500, playAttack);
                                            this._demoTimers.push(t);
                                        }
                                    });
                                    // 玩家走到一半时水晶飞向玩家
                                    const tFly = s.time.delayedCall(300, () => {
                                        if (!attackDrop || !attackDrop.scene) return;
                                        s.tweens.killTweensOf(attackDrop);
                                        s.tweens.add({
                                            targets: attackDrop,
                                            x: () => sprite.x,
                                            y: () => sprite.y,
                                            scale: 0.5,
                                            duration: 250,
                                            ease: 'Cubic.easeIn',
                                            onComplete: () => {
                                                if (attackDrop) attackDrop.destroy();
                                            }
                                        });
                                    });
                                    this._demoTimers.push(tFly);
                                });
                                this._demoTimers.push(tWalk);
                            });
                            this._demoTimers.push(tKill);
                        }
                    };
                    const t = s.time.delayedCall(400, doHit);
                    this._demoTimers.push(t);
                }
            });
        };

        playAttack();
    }

    /** 冲刺演示：玩家走 → 蜘蛛冲过来 → 玩家 SHIFT 冲刺穿过 → 停 → 循环 */
    _demoDash(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx;
        const playerY = ctx.playerY;
        const groundTopY = ctx.groundTopY;
        const startX = cx - 130;
        const endX = cx + 130;

        // 蜘蛛在右侧
        const enemyTex = s.textures.exists('Small_spider_run') ? 'Small_spider_run' : null;
        const enemyY = groundTopY - 13;
        const enemyStartX = cx + 80;
        let enemy;
        if (enemyTex) {
            enemy = s.add.sprite(enemyStartX, enemyY, enemyTex);
            enemy.setScale(1.0).setScrollFactor(0).setDepth(975);
            if (s.anims.exists('small_spider_run')) enemy.play('small_spider_run');
        } else {
            enemy = s.add.rectangle(enemyStartX, enemyY, 32, 24, 0x8800ff)
                .setScrollFactor(0).setDepth(975);
        }
        try { s.cameras.main.ignore(enemy); } catch(e) {}
        this._demoEnemy = enemy;

        const playDash = () => {
            if (!this._animSprite) return;

            sprite.x = startX;
            sprite.y = playerY;
            sprite.setFlipX(false);
            enemy.setPosition(enemyStartX, enemyY);
            enemy.setFlipX(true);  // 蜘蛛朝玩家
            enemy.setAlpha(1);
            enemy.clearTint();
            if (s.anims.exists('small_spider_run') && enemy.play) enemy.play('small_spider_run');
            if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');

            // 1. 玩家走向蜘蛛 (1.5× 走速, 提前到就 idle 等) + 蜘蛛冲过来; 蓄力由蜘蛛到位触发 ((用户) 速度调整后的编排)
            if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run');
            this._demoTween = s.tweens.add({
                targets: sprite,
                x: cx - 80,
                duration: ctx.walkDur((cx - 80) - startX),
                onComplete: () => {
                    if (!this._animSprite) return;
                    if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                }
            });
            s.tweens.add({
                targets: enemy,
                x: cx - 10,
                duration: 1100,
                ease: 'Linear',
                onComplete: () => {
                    if (!this._animSprite) return;
                    // 2. 蜘蛛蓄力攻击（黄色 + 抖动 + attack 动画）
                    enemy.setTint(0xffdd00);  // 蓄力黄色
                    // 蜘蛛蓄力抖动
                    const shakeTween = s.tweens.add({
                        targets: enemy,
                        x: enemy.x + 3,
                        duration: 60,
                        yoyo: true,
                        repeat: 8  // 8 * 120ms = ~1000ms
                    });
                    // 1000ms 后蜘蛛触发 attack 动画（快攻击的瞬间）
                    const t1 = s.time.delayedCall(900, () => {
                        if (!this._animSprite) return;
                        // 3. 蜘蛛 attack 动画快开始（剩 200ms 攻击命中）
                        if (s.anims.exists('small_spider_attack') && enemy.play) {
                            enemy.play('small_spider_attack');
                        }
                        // 4. 玩家冲刺！蓝色闪光 + 残影 + 穿过蜘蛛
                        const t2 = s.time.delayedCall(150, () => {
                            if (!this._animSprite) return;
                            sprite.setTint(0x88ccff);
                            // 残影（在玩家原位）
                            const ghost = s.add.sprite(sprite.x, sprite.y, sprite.texture.key)
                                .setScale(1.0).setAlpha(0.5).setTint(0x88ccff)
                                .setScrollFactor(0).setDepth(975);
                            try { s.cameras.main.ignore(ghost); } catch(e) {}
                            s.tweens.add({
                                targets: ghost,
                                alpha: 0,
                                duration: 300,
                                onComplete: () => ghost.destroy()
                            });

                            s.tweens.add({
                                targets: sprite,
                                x: endX,
                                duration: 250,
                                ease: 'Cubic.easeOut',
                                onComplete: () => {
                                    if (!this._animSprite) return;
                                    sprite.clearTint();
                                    if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                                    // 蜘蛛 idle (run 帧) 朝玩家方向
                                    enemy.clearTint();
                                    if (s.anims.exists('small_spider_run') && enemy.play) enemy.play('small_spider_run');
                                    // 停 3 秒重复
                                    const t3 = s.time.delayedCall(3000, playDash);
                                    this._demoTimers.push(t3);
                                }
                            });
                        });
                        this._demoTimers.push(t2);
                    });
                    this._demoTimers.push(t1);
                }
            });
        };

        playDash();
    }

    /** 石门演示：玩家走到石门 → 攻击 6 下 → 石门碎裂 → 玩家走过去 → 重置循环 */
    _demoStone(sprite) {
        const s = this.scene;
        const ctx = this._demoCtx;
        const cx = ctx.cx;
        const playerY = ctx.playerY;
        const groundTopY = ctx.groundTopY;
        const ceilingY = this._demoCeilingY || (ctx.animTop + 24);
        const TILE = 48;
        const startX = cx - 130;
        const gxStone = ctx.colAt(cx + 30);
        const stoneX = ctx.cellXOf(gxStone);   // (用户) 吸附 demo 晶格
        const endX = cx + 110;

        const stoneW = 48;
        const stoneH = 144;
        const stoneCenterY = groundTopY - stoneH / 2 + 4;

        // 用列表追踪所有此 demo 创建的 sprite
        if (!this._demoStoneSprites) this._demoStoneSprites = [];
        const cleanupSprites = () => {
            this._demoStoneSprites.forEach(sp => {
                if (sp && sp.scene) sp.destroy();
            });
            this._demoStoneSprites = [];
        };
        cleanupSprites();  // 清掉旧的（防止循环重启时残留）

        // 石堆视觉: 有贴图用贴图, 没贴图用同尺寸棕色矩形落地顶替 — 两种都跑完整演示 (旧版没贴图会悬空+提前退出)
        const makeStone = () => {
            const o = s.textures.exists('Stone_door_perfect')
                ? s.add.image(stoneX, stoneCenterY, 'Stone_door_perfect').setDisplaySize(stoneW, stoneH)
                : s.add.rectangle(stoneX, stoneCenterY, stoneW, stoneH, 0x886655, 1).setStrokeStyle(2, 0x442200);
            o.setScrollFactor(0).setDepth(975);
            try { s.cameras.main.ignore(o); } catch(e) {}
            return o;
        };
        let stone = makeStone();
        this._demoEnemy = stone;
        this._demoStoneSprites.push(stone);

        // (用户) 门上方 cavetile 柱走 demo 自动贴皮 — 之前全贴 TRBL 孤岛皮, 与天花板/门口不连接
        const doorTopRow = ctx.floorRow - 3;   // 门 3 格高 (144px), 顶部在 floorRow-3 行
        for (let r = 1; r <= doorTopRow - 1; r++) ctx.addWall(gxStone, r);
        ctx.reskin();
        // (用户) 注册碎裂动画 (StoneDoor 同款) — 没进过有石门的场景时 anims 不存在 → 之前碎门动画播不出来
        if (s.textures.exists('Stone_door_breaking') && !s.anims.exists('stone_door_breaking')) {
            s.anims.create({ key: 'stone_door_breaking', frames: s.anims.generateFrameNumbers('Stone_door_breaking', { start: 0, end: 9 }), frameRate: 10, repeat: 0 });
        }

        const setStage = (stage) => {
            if (!stone || !stone.scene) return;
            let key;
            if (stage === 0) key = 'Stone_door_perfect';
            else if (stage === 1) key = 'Stone_door_small_crack';
            else if (stage === 2) key = 'Stone_door_more_crack';
            else if (stage === 'injuried') key = 'Stone_door_injuried';
            if (stone.setTexture && s.textures.exists(key)) {
                stone.setTexture(key);
                stone.setDisplaySize(stoneW, stoneH);
            }
        };

        const playStone = () => {
            if (!this._animSprite) return;

            // 清掉所有旧的石门相关 sprite
            cleanupSprites();

            // 重新创建 stone (贴图或落地矩形)
            stone = makeStone();
            this._demoEnemy = stone;
            this._demoStoneSprites.push(stone);

            s.tweens.killTweensOf(sprite);
            sprite.x = startX;
            sprite.y = playerY;
            sprite.setFlipX(false);
            if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');

            // 1. 走向石门
            this._demoTween = s.tweens.add({
                targets: sprite,
                x: stoneX - 50,
                duration: ctx.walkDur((stoneX - 50) - startX),   // (用户) 1.5× 统一走速
                onStart: () => { if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run'); },
                onComplete: () => {
                    if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                    let hits = 0;
                    const HIT_CYCLE = 400;
                    const doHit = () => {
                        if (!this._animSprite) return;
                        hits++;
                        if (sprite && sprite.scene && s.anims.exists('melee_attack')) sprite.play('melee_attack');
                        if (stone && stone.scene) {
                            s.tweens.add({ targets: stone, x: stoneX + 3, duration: 50, yoyo: true });
                        }
                        setStage('injuried');
                        const t1 = s.time.delayedCall(120, () => {
                            if (!this._animSprite || !stone || !stone.scene) return;
                            if (hits < 6) {
                                if (hits >= 4) setStage(2);
                                else if (hits >= 2) setStage(1);
                                else setStage(0);
                            }
                        });
                        this._demoTimers.push(t1);

                        if (hits < 6) {
                            const t = s.time.delayedCall(HIT_CYCLE, doHit);
                            this._demoTimers.push(t);
                        } else {
                            const t = s.time.delayedCall(300, () => {
                                if (!this._animSprite) return;
                                if (stone && stone.scene) stone.destroy();
                                stone = null;

                                if (s.textures.exists('Stone_door_breaking')) {
                                    const breakSprite = s.add.sprite(stoneX + 48, stoneCenterY, 'Stone_door_breaking')
                                        .setDisplaySize(144, 144)
                                        .setScrollFactor(0).setDepth(975);
                                    try { s.cameras.main.ignore(breakSprite); } catch(e) {}
                                    this._demoEnemy = breakSprite;
                                    this._demoStoneSprites.push(breakSprite);
                                    if (s.anims.exists('stone_door_breaking')) {
                                        breakSprite.play('stone_door_breaking');
                                        breakSprite.once('animationcomplete-stone_door_breaking', () => {
                                            if (breakSprite && breakSprite.scene) {
                                                breakSprite.setFrame(9);
                                                breakSprite.setDepth(974);
                                            }
                                        });
                                    }
                                }

                                const tWalk = s.time.delayedCall(800, () => {
                                    if (!this._animSprite) return;
                                    if (sprite && sprite.scene && s.anims.exists('run')) sprite.play('run');
                                    s.tweens.add({
                                        targets: sprite, x: endX, duration: ctx.walkDur(endX - (stoneX - 50)),   // (用户) 1.5× 统一走速
                                        onComplete: () => {
                                            if (sprite && sprite.scene && s.anims.exists('idle')) sprite.play('idle');
                                            const t2 = s.time.delayedCall(2500, playStone);
                                            this._demoTimers.push(t2);
                                        }
                                    });
                                });
                                this._demoTimers.push(tWalk);
                            });
                            this._demoTimers.push(t);
                        }
                    };
                    const t = s.time.delayedCall(400, doHit);
                    this._demoTimers.push(t);
                }
            });
        };

        playStone();
    }
}