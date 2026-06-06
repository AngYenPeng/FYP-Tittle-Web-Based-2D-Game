/**
 * ShopSystem — 商店面板
 * 保留原本带图标按钮的布局，只把字体改成 VT323（Undertale 风格）
 */
class ShopSystem {
    constructor(scene) {
        this.scene = scene;
        this.panel = null;
        this.isOpen = false;
        this.crystalDisplay = null;

        this.items = [
            { id: 'healing_potion',  name: 'Healing Potion',  price: 5,  desc: 'Restore 50% HP',                 tex: 'potion_heal_img' },
            { id: 'life_potion',     name: 'Life+ Potion',    price: 15, desc: 'Hearts +1',                      tex: 'potion_life_img' },
            { id: 'health_potion',   name: 'Health Potion',   price: 10, desc: '-50% Corrosion + 30s immunity',  tex: 'potion_health_img' },
            { id: 'health_detector', name: 'Health Detector', price: 10, desc: 'Adds corrosion bar (limit 1)',   tex: 'health_detector_img' },
            { id: 'pet_egg',         name: 'Mysterious Egg',  price: 399, desc: '???',                            tex: 'Small_spider_run' }
            // 黄钥匙不卖 — tutorial 任务专用, 平常掉落/任务奖励获得
        ];
        // (用户) 难度: hard/extreme 不卖加爱心药水, 其余 3 件价格 ×priceMul
        const _sd = (window.AbyssDiff ? AbyssDiff.get() : null);
        if (_sd) {
            if (!_sd.shopLife) this.items = this.items.filter(it => it.id !== 'life_potion');
            if (_sd.priceMul !== 1) this.items.forEach(it => { it.price = Math.round(it.price * _sd.priceMul); });
        }
    }

    init() {
        const s = this.scene;
        let cx = s.cameras.main.width / 2;
        let cy = s.cameras.main.height / 2;

        this.panel = s.add.container(cx, cy).setScrollFactor(0).setDepth(400).setVisible(false);

        let bg = s.add.rectangle(0, 0, 600, 600, 0x000000, 0.92);
        bg.setStrokeStyle(3, 0xffaa00);

        let title = s.add.text(0, -260, 'Mole Trader', {
            fontSize: '40px', color: '#ffaa00',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);

        let subtitle = s.add.text(0, -225, '"Cheaper than the surface, gnhehe..."', {
            fontSize: '20px', color: '#cccccc', fontStyle: 'italic',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);

        // 顶部水晶数：图标 + 数字
        this.crystalDisplayIcon = s.add.image(-25, -185, s.textures.exists('Crystal') ? 'Crystal' : 'drop_crystal_img').setDisplaySize(28, 28);   // (用户) 用 Crystal 实图
        this.crystalDisplay = s.add.text(0, -185, '0', {
            fontSize: '28px', color: '#00ffff',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0, 0.5);

        this.panel.add([bg, title, subtitle, this.crystalDisplayIcon, this.crystalDisplay]);

        // 构建每个商品按钮 (5 个 item, 间距 75)
        let itemY = -125;
        this.items.forEach((item, idx) => {
            let y = itemY + idx * 75;

            // 商品背景 (高度 65 一点点紧凑)
            let itemBg = s.add.rectangle(0, y, 520, 65, 0x222222, 1)
                .setStrokeStyle(2, 0x888888);

            // 图标
            let icon = s.add.image(-220, y, (item.id === 'healing_potion' && s.textures.exists('HpPotion')) ? 'HpPotion' : item.tex).setDisplaySize(40, 40);

            // 名称
            let nameTxt = s.add.text(-170, y - 12, item.name, {
                fontSize: '24px', color: '#ffffff',
                fontFamily: '"VT323", monospace'
            }).setOrigin(0, 0.5);

            // 描述
            let descTxt = s.add.text(-170, y + 12, item.desc, {
                fontSize: '18px', color: '#aaaaaa',
                fontFamily: '"VT323", monospace'
            }).setOrigin(0, 0.5);

            // 价格
            // 价格 = 数字 + 水晶图片
            let priceTxt = s.add.text(140, y, item.price.toString(), {
                fontSize: '24px', color: '#00ffff',
                fontFamily: '"VT323", monospace'
            }).setOrigin(1, 0.5);
            let priceCrystal = s.add.image(155, y, s.textures.exists('Crystal') ? 'Crystal' : 'drop_crystal_img').setDisplaySize(22, 22);   // (用户) 用 Crystal 实图

            // 购买按钮（显式 hit area，origin 已经是 0.5/0.5，hitArea 用 (0,0,w,h)）
            let buyBtn = s.add.rectangle(230, y, 100, 44, 0x228833, 1)
                .setStrokeStyle(2, 0xffffff);
            buyBtn.setInteractive(new Phaser.Geom.Rectangle(0, 0, 100, 44), Phaser.Geom.Rectangle.Contains);
            let buyTxt = s.add.text(230, y, 'BUY', {
                fontSize: '22px', color: '#ffffff',
                fontFamily: '"VT323", monospace'
            }).setOrigin(0.5);

            // 保存引用 (用于 gray-out)
            if (!this._buyButtons) this._buyButtons = {};
            this._buyButtons[item.id] = { buyBtn, buyTxt };

            buyBtn.on('pointerover', () => {
                if (buyBtn._disabled) return;
                buyBtn.setFillStyle(0x33aa44);
            });
            buyBtn.on('pointerout', () => {
                if (buyBtn._disabled) return;
                buyBtn.setFillStyle(0x228833);
            });
            buyBtn.on('pointerdown', () => {
                if (buyBtn._disabled) return;
                this._buy(item);
            });

            this.panel.add([itemBg, icon, nameTxt, descTxt, priceTxt, priceCrystal, buyBtn, buyTxt]);
        });

        // 关闭按钮 (5 个 item 下移)
        let closeBtn = s.add.rectangle(0, 260, 200, 50, 0x444444, 1)
            .setStrokeStyle(2, 0xffffff);
        closeBtn.setInteractive(new Phaser.Geom.Rectangle(0, 0, 200, 50), Phaser.Geom.Rectangle.Contains);
        let closeTxt = s.add.text(0, 260, 'LEAVE (E)', {
            fontSize: '24px', color: '#ffffff',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);
        closeBtn.on('pointerover', () => closeBtn.setFillStyle(0x666666));
        closeBtn.on('pointerout',  () => closeBtn.setFillStyle(0x444444));
        closeBtn.on('pointerdown', () => this.close());
        this.panel.add([closeBtn, closeTxt]);
    }

    open() {
        const s = this.scene;
        this.isOpen = true;
        this.panel.setVisible(true);
        this._refreshCrystalDisplay();
        this._refreshBuyButtons();   // 灰化已购买/已拥有的商品
        s.physics.pause();
        // 显示系统鼠标（取消 canvas 的 cursor: none），隐藏游戏内准星避免双指针
        s.game.canvas.style.cursor = 'none';   // (用户修复) 商店也用精灵光标 — 否则和场景每帧的强制可见打架, 出现双鼠标
        if (s.crosshair) s.crosshair.setVisible(true);
        if (s.leftHandIndicator) s.leftHandIndicator.setVisible(false);
        if (s.rightHandIndicator) s.rightHandIndicator.setVisible(false);
    }

    /** 灰化已不可买的按钮 (健康仪器限购 1 次) */
    _refreshBuyButtons() {
        if (!this._buyButtons) return;
        const s = this.scene;
        // 健康仪器: s._hasHealthDetector 或 腐蚀度条已显示 → 永久灰
        const detectorOwned = !!(s._hasHealthDetector || (s.diseaseSystem && s.diseaseSystem._barVisible));
        const detector = this._buyButtons['health_detector'];
        if (detector) {
            this._setButtonDisabled(detector, detectorOwned);
        }
        // (用户) 宠物彩蛋: 已拥有 → 永久灰
        const egg = this._buyButtons['pet_egg'];
        if (egg) this._setButtonDisabled(egg, !!(s.registry && s.registry.get('hasPetSpider')));
    }

    _setButtonDisabled({ buyBtn, buyTxt }, disabled) {
        buyBtn._disabled = disabled;
        if (disabled) {
            buyBtn.setFillStyle(0x444444);
            buyBtn.setStrokeStyle(2, 0x666666);
            buyTxt.setText('OWNED');
            buyTxt.setColor('#888888');
        } else {
            buyBtn.setFillStyle(0x228833);
            buyBtn.setStrokeStyle(2, 0xffffff);
            buyTxt.setText('BUY');
            buyTxt.setColor('#ffffff');
        }
    }

    close() {
        const s = this.scene;
        this.isOpen = false;
        this.panel.setVisible(false);
        s.physics.resume();
        // 恢复隐藏系统鼠标 + 游戏准星
        s.game.canvas.style.cursor = 'none';
        if (s.crosshair) s.crosshair.setVisible(true);
    }

    _refreshCrystalDisplay() {
        this.crystalDisplay.setText(this.scene.hudSystem.crystalCount.toString());
    }

    _buy(item) {
        const s = this.scene;
        if (s.hudSystem.crystalCount < item.price) {
            this._flashMessage('Not enough crystals!', 0xff4444);
            return;
        }

        // 健康侦测仪 — 限购 1 次, 不进背包, 直接设 scene flag
        if (item.id === 'health_detector') {
            if (s._hasHealthDetector) {
                this._flashMessage('Already owned!', 0xff4444);
                return;
            }
            s.hudSystem.spendCrystal(item.price);
            s._hasHealthDetector = true;
            this._refreshCrystalDisplay();
            this._flashMessage('Health Detector acquired!', 0x44ff44);
            // 按钮永久灰化
            this._refreshBuyButtons();
            // 注册 detector guide (玩家可在 guide 里查看)
            if (s.guideSystem && s.guideSystem.registerGuide) {
                s.guideSystem.registerGuide({
                    id: 'health_detector',
                    title: 'Health Detector',
                    animType: 'detector',
                    captionText: 'Shows your corrosion level. Higher corrosion = slower movement. At 100% you lose HP each second.'
                });
            }
            return;
        }

        // (用户) 宠物彩蛋 — 限购 1 次: 设跨场景旗标 + 当场在玩家脚边孵出
        if (item.id === 'pet_egg') {
            if (s.registry && s.registry.get('hasPetSpider')) {
                this._flashMessage('Already owned!', 0xff4444);
                return;
            }
            s.hudSystem.spendCrystal(item.price);
            if (s.registry) s.registry.set('hasPetSpider', true);
            if (typeof AchievementSystem !== 'undefined') AchievementSystem.unlock(s, 'best_friend');   // (用户成就) 最好的伙伴
            if (typeof PetSpider !== 'undefined' && s.player && (!s._petSpider || !s._petSpider.scene)) {
                s._petSpider = new PetSpider(s, s.player.x, s.player.y);
            }
            this._refreshCrystalDisplay();
            this._flashMessage('Egg hatched! A tiny spider follows you.', 0x44ff44);
            this._refreshBuyButtons();
            return;
        }

        // 增命药水 — 购买后直接 +1 爱心, 不进背包 (因为没 Z/X/C 槽给它)
        if (item.id === 'life_potion') {
            const hs = s.healthSystem;
            if (hs.hearts >= hs.maxHearts) {
                this._flashMessage('Hearts already maxed!', 0xff4444);
                return;
            }
            s.hudSystem.spendCrystal(item.price);
            hs.addHeart(1);
            this._refreshCrystalDisplay();
            this._flashMessage('+1 Heart!', 0x44ff44);
            return;
        }

        if (!s.inventorySystem.canAdd(item.id, 1)) {
            this._flashMessage('Inventory is full!', 0xff4444);
            return;
        }
        s.hudSystem.spendCrystal(item.price);
        s.inventorySystem.addItem(item.id, 1, { silent: true });   // (用户) 购买不是拾取, 不播 Pickup
        // 防御性: 强制刷新右下角 hotbar (修 UI 偶尔不同步的 bug)
        if (s.backpackSystem && s.backpackSystem.refreshQuick) {
            s.backpackSystem.refreshQuick();
        }
        this._refreshCrystalDisplay();
        this._flashMessage('Purchased!', 0x44ff44);

        // 买了钥匙 → 触发钥匙剧情（已不卖钥匙, 但保留代码以防别处用）
        if (item.id === 'key' && !s._keyPlotTriggered && s.openingCinematic && s.openingCinematic.startKeyPlot) {
            s._keyPlotTriggered = true;
            this.close();
            s.time.delayedCall(300, () => s.openingCinematic.startKeyPlot());
        }
    }

    _flashMessage(text, hexColor) {
        const s = this.scene;
        // (用户) 红=交易失败→CantBuy, 绿=购买成功→Buy; 速度 ×2
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(s, hexColor === 0xff4444 ? 'CantBuy' : 'Buy', { rate: 2 });
        let cx = s.cameras.main.width / 2;
        let cy = s.cameras.main.height / 2;
        let cssColor = '#' + hexColor.toString(16).padStart(6, '0');
        let msg = s.add.text(cx, cy + 240, text, {
            fontSize: '24px', color: cssColor,
            fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(401);
        s.tweens.add({
            targets: msg, alpha: 0, y: cy + 200,
            duration: 900, onComplete: () => msg.destroy()
        });
    }
}