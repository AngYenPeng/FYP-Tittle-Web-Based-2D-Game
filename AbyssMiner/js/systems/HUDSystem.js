/**
 * HUDSystem — 顶部UI（水晶数量）+ 药水使用 + 确认对话框
 */
class HUDSystem {
    constructor(scene) {
        this.scene = scene;
        this.crystalCount = 1000; // (用户) 开局水晶归零 (测试期曾给 1000)
        this.crystalIcon = null;
        this.crystalText = null;
        this.yellowCrystalCount = 0;  // (用户) 黄水晶归零 (测试期曾给 100)
        this.yellowCrystalIcon = null;
        this.yellowCrystalText = null;
        this.yellowCrystalShown = false;  // 首次获得后才显示

        // 确认面板相关
        this.confirmPanel = null;
        this.confirmCallback = null; // function(isYes)
        this.gamePausedByConfirm = false;
    }

    init() {
        const s = this.scene;
        const W = s.cameras.main.width;

        // 水晶 UI — 中心 (60, 120) 与心形 (60, 60) 上下对齐，间距 60
        const crystalTex = s.textures.exists('Crystal') ? 'Crystal' : 'drop_crystal_img';
        this.crystalIcon = s.add.image(60, 120, crystalTex)
            .setDepth(200).setScrollFactor(0).setScale(1.5);

        this.crystalText = s.add.text(90, 108, 'x ' + this.crystalCount, {
            fontSize: '24px', color: '#00ffff', fontStyle: 'bold',
            fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 4
        }).setDepth(200).setScrollFactor(0);

        // 黄水晶 UI — (60, 180), 首次获得后才显示 (用 YCrystal 黄色货币图, 不染色)
        const yCrystalTex = s.textures.exists('YCrystal') ? 'YCrystal' : crystalTex;
        this.yellowCrystalIcon = s.add.image(60, 180, yCrystalTex)
            .setDepth(200).setScrollFactor(0).setScale(1.5)
            .setVisible(false);
        if (yCrystalTex !== 'YCrystal') this.yellowCrystalIcon.setTint(0xffcc33);  // 仅贴图缺失时回退染色
        this.yellowCrystalText = s.add.text(90, 168, 'x ' + this.yellowCrystalCount, {
            fontSize: '24px', color: '#ffcc33', fontStyle: 'bold',
            fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 4
        }).setDepth(200).setScrollFactor(0).setVisible(false);

        // ── 攻略指南按钮（在水晶下方，左对齐）─────────────
        this._buildGuideButton();

        // ── 右上角按钮 ──────────────────────────────────────
        this._buildTopRightButtons(W);

        // 预创建确认面板
        this._createConfirmPanel();

        // 开局已有黄水晶 (测试) → 立即显示 + 重排
        if (this.yellowCrystalCount > 0 && !this.yellowCrystalShown) {
            this.yellowCrystalShown = true;
            if (this.yellowCrystalIcon) this.yellowCrystalIcon.setVisible(true);
            if (this.yellowCrystalText) this.yellowCrystalText.setText('x ' + this.yellowCrystalCount).setVisible(true);
            this._restackHUD();
        }
    }

    /** 攻略指南按钮 — 1.5 倍大，对齐心形/水晶 */
    _buildGuideButton() {
        const s = this.scene;
        // 心 (60,60) 水晶 (60,120) 感叹号 (60,180)，间距 60
        this.guideBtn = s.add.container(60, 180)
            .setScrollFactor(0).setDepth(200);

        const bg = s.add.rectangle(0, 0, 54, 54, 0x222244, 0.88)
            .setStrokeStyle(2, 0x6688aa).setInteractive();
        const txt = s.add.text(0, 0, '!', {
            fontSize: '36px', color: '#ffcc55', fontStyle: 'bold',
            fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);

        // 红点（右上 +3 右 +3 上）
        this.guideRedDot = s.add.circle(25, -25, 8, 0xff3333);

        bg.on('pointerover', () => bg.setFillStyle(0x333366, 0.95));
        bg.on('pointerout',  () => bg.setFillStyle(0x222244, 0.88));
        bg.on('pointerdown', () => {
            if (s._cinematicLock || (s.dialogSystem && s.dialogSystem.isOpen)) return;
            if (s.guideSystem) s.guideSystem.open();
        });

        this.guideBtn.add([bg, txt, this.guideRedDot]);

        // 只闪红点（不闪整个按钮）
        this._guideBlinkTween = s.tweens.add({
            targets: this.guideRedDot,
            alpha: { from: 1, to: 0.3 },
            duration: 700,
            yoyo: true,
            repeat: -1
        });
    }

    /** 每帧更新红点 / 闪烁状态 */
    updateGuideButton() {
        const s = this.scene;
        if (!this.guideBtn || !s.guideSystem) return;
        const unread = s.guideSystem.hasUnread();
        this.guideRedDot.setVisible(unread);
        if (unread) {
            if (this._guideBlinkTween && this._guideBlinkTween.paused) {
                this._guideBlinkTween.resume();
            }
        } else {
            if (this._guideBlinkTween && !this._guideBlinkTween.paused) {
                this._guideBlinkTween.pause();
                this.guideRedDot.setAlpha(1);
            }
        }
    }

    _buildTopRightButtons(W) {
        const s = this.scene;
        const H = s.cameras.main.height;

        // 右上：[背包] [设定] — 设定在最右（位置交换）
        // 设定按钮（最右）— 54×54
        const setBtn = s.add.container(W - 40, 40)
            .setScrollFactor(0).setDepth(200);
        const setBg = s.add.rectangle(0, 0, 54, 54, 0x222222, 0.88)
            .setStrokeStyle(2, 0x666666).setInteractive();
        const setTxt = s.textures.exists('Setting')
            ? s.add.image(0, 0, 'Setting').setDisplaySize(32, 32).setOrigin(0.5)
            : s.add.text(0, 0, '⚙', { fontSize: '32px' }).setOrigin(0.5);
        setBg.on('pointerover', () => setBg.setFillStyle(0x333333, 0.95));
        setBg.on('pointerout',  () => setBg.setFillStyle(0x222222, 0.88));
        setBg.on('pointerdown', () => {
            if (s.settingsSystem) s.settingsSystem.toggle();
        });
        setBtn.add([setBg, setTxt]);
        this.settingsBtn = setBtn;

        // (用户) 右上角背包按钮已删除 (背包功能本体保留)

        // (用户) 创造模式按钮: 默认隐藏 — 每次进图都要重新连按密码 122334455667788990, 答对才出现
        const cmBtn = s.add.container(40, H - 40)
            .setScrollFactor(0).setDepth(200).setVisible(false);
        const cmBg = s.add.rectangle(0, 0, 54, 54, 0x222244, 0.88)
            .setStrokeStyle(2, 0x6688aa).setInteractive();
        const cmTxt = s.add.text(0, 0, 'CR', {
            fontSize: '24px', color: '#88ccff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);
        cmBg.on('pointerover', () => cmBg.setFillStyle(0x333355, 0.95));
        cmBg.on('pointerout',  () => cmBg.setFillStyle(0x222244, 0.88));
        cmBg.on('pointerdown', () => {
            if (s._cinematicLock || (s.dialogSystem && s.dialogSystem.isOpen)) return;
            if (s.creativeSystem) s.creativeSystem.toggle();
        });
        cmBtn.add([cmBg, cmTxt]);
        this.creativeBtn = cmBtn;

        this._topBtns = [setBtn, cmBtn];
    }

    /** 显示/隐藏 HUD（除设定按钮外）— 转场/对话期间用 */
    setHUDVisible(visible) {
        const s = this.scene;
        // 心形 (旧, 已无 — heartSprites 现在是空数组)
        if (s.healthSystem && s.healthSystem.heartSprites) {
            s.healthSystem.heartSprites.forEach(p => {
                if (p.left) p.left.setVisible(visible);
                if (p.right) p.right.setVisible(visible);
                if (p.shield) p.shield.setVisible(visible);
            });
        }
        // 新 HP 条 + 爱心数 (阶段 3 改造后)
        if (s.healthSystem) {
            const hs = s.healthSystem;
            if (hs.hpBarBg)     hs.hpBarBg.setVisible(visible);
            if (hs.hpBarFill)   hs.hpBarFill.setVisible(visible);
            if (hs.hpBarBorder) hs.hpBarBorder.setVisible(visible);
            if (hs.hpText)      hs.hpText.setVisible(visible);
            if (hs.heartsText)  hs.heartsText.setVisible(visible);
            if (hs.heartIcon)   hs.heartIcon.setVisible(visible);   // (用户) Heart 图标随 HUD 显隐
        }
        // 腐蚀度条 (阶段 4) — 只在 _barVisible (有侦测仪) 时才回到 visible 状态
        if (s.diseaseSystem) {
            const ds = s.diseaseSystem;
            const showCorrosion = visible && ds._barVisible;
            [ds.corrosionBg, ds.corrosionFill, ds.corrosionBorder,
             ds.corrosionLine20, ds.corrosionLine50, ds.corrosionText].forEach(o => {
                if (o) o.setVisible(showCorrosion);
            });
        }
        // 水晶
        if (this.crystalIcon) this.crystalIcon.setVisible(visible);
        if (this.crystalText) this.crystalText.setVisible(visible);
        // 黄水晶 — 仅当已显示过 (首次获得后) 才跟着 visible
        if (this.yellowCrystalShown) {
            if (this.yellowCrystalIcon) this.yellowCrystalIcon.setVisible(visible);
            if (this.yellowCrystalText) this.yellowCrystalText.setVisible(visible);
        }
        // 感叹号
        if (this.guideBtn) this.guideBtn.setVisible(visible);
        // 背包按钮（设定保留）
        if (this.backpackBtn) this.backpackBtn.setVisible(visible);
        // 创造按钮
        if (this.creativeBtn) this.creativeBtn.setVisible(visible && !!(s.creativeSystem && s.creativeSystem._pwUnlocked));   // (用户) 未解锁时永远隐藏
        // 右下快捷槽
        if (s.backpackSystem && s.backpackSystem.setHotbarVisible) {
            s.backpackSystem.setHotbarVisible(visible);
        }
    }

    addCrystal(n = 1) {
        this.crystalCount += n;
        this.crystalText.setText('x ' + this.crystalCount);
    }

    /** 刷新水晶数字显示 — 继承状态/读档后调用, 把文本同步到当前 crystalCount */
    refreshCrystal() {
        if (this.crystalText) this.crystalText.setText('x ' + this.crystalCount);
        if (this.yellowCrystalText) this.yellowCrystalText.setText('x ' + this.yellowCrystalCount);
    }

    /** 加黄水晶 (任务货币). 首次获得时显示 + guide button 下移 */
    addYellowCrystal(n = 1) {
        this.yellowCrystalCount += n;
        if (this.yellowCrystalText) this.yellowCrystalText.setText('x ' + this.yellowCrystalCount);
        // 首次获得 → 显示黄水晶 UI + 把 guide button 推下去
        if (!this.yellowCrystalShown && this.yellowCrystalCount > 0) {
            this.yellowCrystalShown = true;
            if (this.yellowCrystalIcon) this.yellowCrystalIcon.setVisible(true);
            if (this.yellowCrystalText) this.yellowCrystalText.setVisible(true);
            this._restackHUD();
        }
    }

    spendYellowCrystal(n) {
        if (this.yellowCrystalCount < n) return false;
        this.yellowCrystalCount -= n;
        if (this.yellowCrystalText) this.yellowCrystalText.setText('x ' + this.yellowCrystalCount);
        return true;
    }

    /** 重新排 HUD 元素 y 位置 — 根据当前显示状态 (心 / 蓝 / 黄? / guide) */
    _restackHUD() {
        if (!this.crystalIcon || !this.crystalText || !this.guideBtn) return;
        const hasDetector = !!this._healthDetectorBought;
        // 起始 y (蓝水晶位置): 有 detector → 180, 否则 → 120
        let y = hasDetector ? 180 : 120;
        this.crystalIcon.y = y;
        this.crystalText.y = y - 12;
        y += 60;
        if (this.yellowCrystalShown) {
            this.yellowCrystalIcon.y = y;
            this.yellowCrystalText.y = y - 12;
            y += 60;
        }
        this.guideBtn.y = y;
    }

    /** 重排: 买了健康侦测仪后, crystal/guide 下移 60px 给腐蚀度条让位 */
    _updateHealthDetectorLayout(hasDetector) {
        this._healthDetectorBought = hasDetector;
        this._restackHUD();
    }

    spendCrystal(n) {
        if (this.crystalCount < n) return false;
        this.crystalCount -= n;
        this.crystalText.setText('x ' + this.crystalCount);
        return true;
    }

    _createConfirmPanel() {
        const s = this.scene;
        let cx = s.cameras.main.width / 2;
        let cy = s.cameras.main.height / 2;

        this.confirmPanel = s.add.container(cx, cy)
            .setScrollFactor(0).setDepth(400).setVisible(false);

        let bg = s.add.rectangle(0, 0, 550, 220, 0x000000, 0.92);
        bg.setStrokeStyle(3, 0xffffff);

        let title = s.add.text(0, -60, 'Use this potion?', {
            fontSize: '32px', color: '#ffffff',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);

        this.confirmSubText = s.add.text(0, -20, 'It will have no effect.', {
            fontSize: '22px', color: '#ffaaaa',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);

        let yesBtn = s.add.rectangle(-100, 50, 160, 55, 0x228833, 1)
            .setStrokeStyle(2, 0xffffff);
        yesBtn.setInteractive(new Phaser.Geom.Rectangle(0, 0, 160, 55), Phaser.Geom.Rectangle.Contains);
        let yesTxt = s.add.text(-100, 50, 'YES', {
            fontSize: '28px', color: '#ffffff',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);

        let noBtn = s.add.rectangle(100, 50, 160, 55, 0x883333, 1)
            .setStrokeStyle(2, 0xffffff);
        noBtn.setInteractive(new Phaser.Geom.Rectangle(0, 0, 160, 55), Phaser.Geom.Rectangle.Contains);
        let noTxt = s.add.text(100, 50, 'NO', {
            fontSize: '28px', color: '#ffffff',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);

        yesBtn.on('pointerover', () => yesBtn.setFillStyle(0x33aa44));
        yesBtn.on('pointerout',  () => yesBtn.setFillStyle(0x228833));
        noBtn.on('pointerover',  () => noBtn.setFillStyle(0xaa4444));
        noBtn.on('pointerout',   () => noBtn.setFillStyle(0x883333));

        yesBtn.on('pointerdown', () => this._resolveConfirm(true));
        noBtn.on('pointerdown',  () => this._resolveConfirm(false));

        this.confirmPanel.add([bg, title, this.confirmSubText, yesBtn, yesTxt, noBtn, noTxt]);
    }

    showConfirm(subMessage, callback) {
        this.confirmSubText.setText(subMessage);
        this.confirmCallback = callback;
        this.confirmPanel.setVisible(true);
        this.gamePausedByConfirm = true;
        this.scene.physics.pause();
        // 显示系统鼠标 + 隐藏游戏内准星
        const s = this.scene;
        s.game.canvas.style.cursor = 'none';   // (用户修复) 继续用精灵光标 — CSS 原生尺寸不随画布缩放会忽大
        if (s.crosshair) s.crosshair.setVisible(true);
        if (s.leftHandIndicator) s.leftHandIndicator.setVisible(false);
        if (s.rightHandIndicator) s.rightHandIndicator.setVisible(false);
    }

    _resolveConfirm(isYes) {
        this.confirmPanel.setVisible(false);
        this.gamePausedByConfirm = false;
        this.scene.physics.resume();
        // 恢复隐藏系统鼠标 + 游戏准星
        const s = this.scene;
        s.game.canvas.style.cursor = 'none';
        if (s.crosshair) s.crosshair.setVisible(true);
        let cb = this.confirmCallback;
        this.confirmCallback = null;
        if (cb) cb(isYes);
    }

    /** 旧代码可能调用此方法 — 现在交由 BackpackSystem 处理，保留接口不报错 */
    tryUseActiveItem() {
        // 旧的药水使用路径已迁移到 BackpackSystem.useQuickSlot()
        // 保留空实现防止旧调用报错
    }
}