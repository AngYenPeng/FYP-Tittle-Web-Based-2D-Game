/**
 * TitleScene — 起始标题页面
 * Hollow Knight 风格：暗黑背景 + 大标题 + 居中菜单按钮
 * 按钮：START / TUTORIAL / QUIT
 */
class TitleScene extends Phaser.Scene {
    constructor() { super('TitleScene'); }

    preload() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.loadAll(this);  // 加载全部音频
        // 标题页背景图（洞穴）
        this.load.image('Tittle_scene_background_image', 'assets/images/Tittle_scene_background_image.png');
        this.load.image('Mouse_cursor', 'assets/images/Mouse_cursor.png');   // (用户) Title 精灵光标用
    }

    create() {
        // 复位状态 — 场景重启 (Save&Exit 回主页) 时实例属性会残留, 不清会卡死所有按钮
        this._fading = false;
        this._modalOpen = false;
        this.settingsSystem = null;   // (用户修复) 旧实例的显示对象随上轮场景销毁, 复用会 open 无效且卡死 _modalOpen → options/credits 全哑
        if (this.cameras && this.cameras.main) this.cameras.main.resetFX();
        if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_TitleScene');  // BGM
        // 等 VT323 字体加载好再渲染（避免 fallback 字体显示尺寸不一致）
        if (document.fonts && document.fonts.load) {
            // 触发加载
            document.fonts.load('30px "VT323"').then(() => this._doCreate());
            document.fonts.load('40px "VT323"');
            document.fonts.load('72px "VT323"');
            return;
        }
        this._doCreate();
    }

    _doCreate() {
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;

        // 背景：用洞穴图片（如果加载成功），失败则回退到渐变
        if (this.textures.exists('Tittle_scene_background_image')) {
            let img = this.add.image(W / 2, H / 2, 'Tittle_scene_background_image');
            // 缩放铺满画面（保持比例 → 用 max 让短边铺满）
            let scale = Math.max(W / img.width, H / img.height);
            img.setScale(scale);
            // 上面盖一层半透明黑色（让标题文字更清晰）
            this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.35);
        } else {
            // fallback：原本的渐变背景
            let bg = this.add.graphics();
            bg.fillGradientStyle(0x0a0a1a, 0x0a0a1a, 0x000000, 0x000000, 1);
            bg.fillRect(0, 0, W, H);
        }

        // 装饰：随机闪烁的小水晶点
        for (let i = 0; i < 60; i++) {
            let star = this.add.circle(
                Phaser.Math.Between(0, W),
                Phaser.Math.Between(0, H),
                Phaser.Math.Between(1, 2),
                0x88aaff, Phaser.Math.FloatBetween(0.3, 0.9)
            );
            this.tweens.add({
                targets: star,
                alpha: { from: 0.2, to: 0.9 },
                duration: Phaser.Math.Between(1500, 3000),
                yoyo: true, repeat: -1
            });
        }

        // 主标题
        let title = this.add.text(W / 2, H * 0.30, 'ABYSS MINER', {
            fontSize: '88px',
            color: '#ffffff',
            fontFamily: '"VT323", monospace',
            stroke: '#3344aa',
            strokeThickness: 6
        }).setOrigin(0.5);
        // 标题缓慢呼吸
        this.tweens.add({
            targets: title, alpha: { from: 0.85, to: 1 },
            duration: 2200, yoyo: true, repeat: -1
        });

        // 副标题
        this.add.text(W / 2, H * 0.40, 'A Grappling Adventure', {
            fontSize: '28px',
            color: '#aaaaaa',
            fontFamily: '"VT323", monospace',
            fontStyle: 'italic'
        }).setOrigin(0.5);

        // === 菜单按钮 ===
        const menuItems = [
            { label: 'START',       action: () => this._openSlotSelect() },
            { label: 'SAFEZONE1',   action: () => this._devJump('SafeZone1Scene') },
            { label: 'SAFEZONE2',   action: () => this._devJump('SafeZone2Scene') },
            { label: 'SAFEZONE2.5', action: () => this._devJump('SafeZone25Scene') },
            { label: 'SAFEZONE3',   action: () => this._devJump('SafeZone3Scene') },
            { label: 'SAFEZONE4',   action: () => this._devJump('SafeZone4Scene') },
            { label: 'SAFEZONE5',   action: () => this._devJump('SafeZone5Scene') },
            { label: 'OPTIONS',     action: () => this._openOptions() },
            { label: 'ACHIEVEMENTS', action: () => { if (typeof AchievementSystem !== 'undefined') AchievementSystem.showPanel(this); } },   // (用户) 成就直达
            { label: 'CREDITS',     action: () => this._openCredits() },
            { label: 'QUIT',        action: () => { alert('Thanks for playing!'); } }
        ];
        const baseY = H * 0.44;
        const itemSpacing = 42;

        menuItems.forEach((mi, idx) => {
            let y = baseY + idx * itemSpacing;
            let txt = this.add.text(W / 2, y, mi.label, {
                fontSize: '26px',
                color: '#aaaaaa',
                fontFamily: '"VT323", monospace'
            }).setOrigin(0.5);
            // hitArea 用宽松一点的范围，origin 0.5 时局部范围(-w/2, -h/2, w, h)
            // 但 Phaser hitTest 用 (pointerX - obj.x + displayOriginX) 计算，所以 hitArea 起点应该是 (0, 0)
            let w = txt.width, h = txt.height;
            txt.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
            txt.on('pointerover', () => txt.setColor('#ffff00'));
            txt.on('pointerout',  () => txt.setColor('#aaaaaa'));
            txt.on('pointerdown', () => { if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this, 'Select'); mi.action(); });
        });

        // 底部版本号
        this.add.text(W - 20, H - 20, 'v0.1', {
            fontSize: '18px', color: '#555555',
            fontFamily: '"VT323", monospace'
        }).setOrigin(1, 1);

        // (用户修复) Title 改用局内同款精灵光标 — CSS 光标按屏幕原生 64px 显示, 不随画布缩放, 比局内大
        this.game.canvas.style.cursor = 'none';
        if (this.textures.exists('Mouse_cursor')) {
            const _p0 = this.input && this.input.activePointer;
            this.crosshair = this.add.sprite(_p0 ? _p0.x : 0, _p0 ? _p0.y : 0, 'Mouse_cursor')
                .setDepth(99999).setScrollFactor(0);
            this.input.on('pointermove', (pointer) => {
                if (this.crosshair && this.crosshair.active) this.crosshair.setPosition(pointer.x, pointer.y);
            });
        } else {
            // 贴图缺失回退 CSS
            this.game.canvas.style.cursor = 'url(assets/images/Mouse_cursor.png) 32 32, default';
        }
    }

    _fadeAndStart(sceneKey, data, resetGuides = true) {
        if (this._fading) return;
        this._fading = true;
        // 重置 guide 已读状态（新游戏 = 从头开始；resume 时保留）
        if (resetGuides) {
            try { localStorage.removeItem('abyssMinerGuidesRead'); } catch {}
        }
        // (用户修复) 渐暗是主相机 fadeOut, 会把同相机的精灵光标一起压黑 — 渐暗期间切像素同尺寸的 CSS 光标顶上
        try {
            const _cv = this.game.canvas;
            const _sc = _cv && _cv.clientWidth ? (_cv.clientWidth / _cv.width) : 1;
            const _hot = Math.round(32 * _sc);
            _cv.style.cursor = 'url(assets/images/Mouse_cursor.png) 32 32, default';   // 兜底
            _cv.style.cursor = '-webkit-image-set(url(assets/images/Mouse_cursor.png) ' + (1 / _sc).toFixed(3) + 'x) ' + _hot + ' ' + _hot + ', default';
            if (this.crosshair) this.crosshair.setVisible(false);
        } catch (e) {}
        this.cameras.main.fadeOut(1000, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            // (用户) 大场景 create 同步重建几千墙体+皮肤, 主线程冻结几秒 — 黑屏像卡死.
            //   垫一个 DOM "Loading..." 层 (不依赖被冻结的 canvas), 等浏览器画出来再切场景;
            //   setInterval 冻结期不跑, 解冻后探测到新场景 RUNNING 自动摘掉.
            let div = document.getElementById('azm-scene-loading');
            if (!div) {
                div = document.createElement('div');
                div.id = 'azm-scene-loading';
                div.style.cssText = 'position:fixed;inset:0;background:#000;color:#cfcfcf;display:flex;align-items:center;justify-content:center;font:20px monospace;z-index:9999;letter-spacing:2px;cursor:url(assets/images/Mouse_cursor.png) 32 32, default;';   // (用户修复) 过场鼠标可见
                try {
                    // (用户修复) 动态密度: 局内精灵 = 64 游戏px × 画布缩放; 这里按同公式算 CSS 显示尺寸, 逐像素一致
                    const _cv = this.game.canvas;
                    const _sc = _cv && _cv.clientWidth ? (_cv.clientWidth / _cv.width) : 1;
                    const _hot = Math.round(32 * _sc);
                    div.style.cursor = '-webkit-image-set(url(assets/images/Mouse_cursor.png) ' + (1 / _sc).toFixed(3) + 'x) ' + _hot + ' ' + _hot + ', default';
                } catch (e) {}
                div.textContent = 'Loading...';
                document.body.appendChild(div);
            }
            const removeDiv = () => {
                const d = document.getElementById('azm-scene-loading'); if (d) d.remove();
                // (用户修复) 开关式交接: 重叠期精灵让位 (场景每帧可见性尊重 _cssCursorOverlap), CSS 独挑;
                //   300ms 后翻标志让精灵先上屏一帧, 再撤 CSS → 既不消失也不双鼠标
                try {
                    const _live = this.game.scene.getScenes(true)[0];
                    if (_live) { _live._cssCursorOverlap = true; if (_live.crosshair) _live.crosshair.setVisible(false); }
                    const _cv = this.game.canvas;
                    const _sc = _cv && _cv.clientWidth ? (_cv.clientWidth / _cv.width) : 1;
                    const _hot = Math.round(32 * _sc);
                    _cv.style.cursor = 'url(assets/images/Mouse_cursor.png) 32 32, default';
                    _cv.style.cursor = '-webkit-image-set(url(assets/images/Mouse_cursor.png) ' + (1 / _sc).toFixed(3) + 'x) ' + _hot + ' ' + _hot + ', default';
                    setTimeout(() => {
                        try {
                            if (_live) _live._cssCursorOverlap = false;   // 精灵下一帧恢复
                            if (_live && _live.crosshair) {
                                setTimeout(() => { try { _cv.style.cursor = 'none'; } catch (e) {} }, 60);   // 等含精灵的帧上屏再撤 CSS
                            }
                            // (用户修复) 无精灵光标的场景 (StartIntro/Opening) → 保留 CSS 光标, 不切 none
                        } catch (e) {}
                    }, 300);
                } catch (e) {}
            };
            const iv = setInterval(() => {
                const scs = this.game.scene.getScenes(true);
                const sc = scs && scs[0];
                if (sc && sc.scene.key !== 'TitleScene' && sc.sys.settings.status === Phaser.Scenes.RUNNING) {
                    clearInterval(iv);
                    setTimeout(removeDiv, 150);   // (用户修复) 等新场景先渲染几帧精灵光标再摘层 — 否则摘层瞬间 canvas 是 none 而精灵还没画出来, 鼠标消失一下
                }
            }, 100);
            setTimeout(() => { removeDiv(); clearInterval(iv); }, 15000);   // 兜底
            setTimeout(() => { this.scene.start(sceneKey, data); }, 60);    // 给浏览器 ~2 帧画出 Loading 层
        });
    }

    // ═══ 存档位选择 (Hollow Knight 风格: 3 位, 读/新建/删) ═══
    _openSlotSelect() {
        if (this._modalOpen) return;
        this._modalOpen = true;
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;

        const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78).setDepth(900).setInteractive();   // (用户修复) 吃掉点击, 防止穿透到标题按钮
        const panel = this.add.container(W / 2, H / 2).setDepth(901);
        const PW = 660, PH = 470;
        const bg = this.add.rectangle(0, 0, PW, PH, 0x0a0a18, 0.97).setStrokeStyle(3, 0x6688aa).setInteractive();   // (用户修复) 面板缝隙也不能穿透
        const title = this.add.text(0, -PH / 2 + 30, 'SELECT SAVE', {
            fontSize: '34px', color: '#ffcc55', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);
        panel.add([bg, title]);

        const N = SaveSystem.NUM_SLOTS || 3;
        let rowItems = [];

        const buildSlots = () => {
            rowItems.forEach(o => { try { o.destroy(); } catch (e) {} });
            rowItems = [];
            for (let i = 1; i <= N; i++) {
                const y = -120 + (i - 1) * 92;
                const data = SaveSystem.getSlot(i);

                const rowBg = this.add.rectangle(0, y, PW - 80, 78, 0x14142a, 1)
                    .setStrokeStyle(2, 0x445577).setInteractive();
                rowBg.on('pointerover', () => rowBg.setFillStyle(0x1e1e3a, 1));
                rowBg.on('pointerout',  () => rowBg.setFillStyle(0x14142a, 1));

                const slotLbl = this.add.text(-PW / 2 + 60, y - 16, 'SLOT ' + i, {
                    fontSize: '24px', color: '#88ccff', fontFamily: '"VT323", monospace',
                    stroke: '#000', strokeThickness: 3
                }).setOrigin(0, 0.5);

                rowItems.push(rowBg, slotLbl);

                if (data) {
                    const zone = SaveSystem.zoneName(data.scene);
                    // (用户) 阵亡存档: 红色 FALLEN 标记, 不可继续 (只能删除)
                    const info = this.add.text(-PW / 2 + 60, y + 14,
                        data.dead ? (zone + '    \u2620 FALLEN') :
                        (zone + '    \u25C6 ' + (data.crystalCount || 0) + '    \u2665 ' + (data.hearts || 0)), {
                        fontSize: '18px', color: data.dead ? '#ff6666' : '#dddddd', fontFamily: '"VT323", monospace'
                    }).setOrigin(0, 0.5);
                    const tstamp = this.add.text(PW / 2 - 90, y - 16, SaveSystem.savedAgo(data.savedAt), {
                        fontSize: '13px', color: '#777788', fontFamily: '"VT323", monospace'
                    }).setOrigin(1, 0.5);

                    // 删除按钮 (2 次点击确认)
                    const del = this.add.text(PW / 2 - 56, y + 12, '\u2715', {
                        fontSize: '24px', color: '#ff5555', fontFamily: '"VT323", monospace',
                        stroke: '#000', strokeThickness: 3
                    }).setOrigin(0.5).setInteractive();
                    let confirm = false;
                    del.on('pointerover', () => del.setAlpha(0.7));
                    del.on('pointerout',  () => del.setAlpha(1));
                    del.on('pointerdown', () => {
                        if (!confirm) {
                            confirm = true;
                            del.setText('SURE?').setFontSize(16);
                            this.time.delayedCall(1800, () => {
                                if (del.active) { confirm = false; del.setText('\u2715').setFontSize(24); }
                            });
                            return;
                        }
                        SaveSystem.deleteSlot(i);
                        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this, 'Select');
                        buildSlots();
                    });

                    rowBg.on('pointerdown', () => {
                        if (data.dead) return;   // (用户) 阵亡档不可继续 (用 ✕ 删除后可重开)
                        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this, 'Select');
                        this._resumeSlot(i, data);
                    });
                    rowItems.push(info, tstamp, del);
                } else {
                    const info = this.add.text(-PW / 2 + 60, y + 14, '- Empty -  (click to start new)', {
                        fontSize: '18px', color: '#777777', fontFamily: '"VT323", monospace'
                    }).setOrigin(0, 0.5);
                    rowBg.on('pointerdown', () => {
                        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this, 'Select');
                        this._newGameSlot(i);
                    });
                    rowItems.push(info);
                }
            }
            panel.add(rowItems);
        };
        buildSlots();

        const backBtn = this.add.text(0, PH / 2 - 38, '[ BACK ]', {
            fontSize: '26px', color: '#ff8888', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setInteractive();
        backBtn.on('pointerover', () => backBtn.setColor('#ffffff'));
        backBtn.on('pointerout',  () => backBtn.setColor('#ff8888'));
        backBtn.on('pointerdown', () => { dim.destroy(); panel.destroy(); this._modalOpen = false; });
        panel.add(backBtn);
    }

    // dev 菜单直接跳场景 (不绑存档位, 清空 current 避免污染真存档)
    _devJump(sceneKey) {
        if (typeof SaveSystem !== 'undefined') SaveSystem.setCurrentSlot(null);
        this._fadeAndStart(sceneKey, null, true);
    }

    _newGameSlot(n) {
        this._showDifficultySelect(n);   // (用户) 空档先选难度
    }

    _startNewGameWithDifficulty(n, mode) {
        if (window.AbyssDiff) AbyssDiff.set(mode);
        try { this.registry.set('pickaxeUpgraded', false); } catch (e) {}   // (用户修复) 新游戏清跨场景旗标 — 防上一局残留免对话解锁
        try { this.registry.set('hasPetSpider', false); } catch (e) {}   // (用户) 宠物旗标同清
        try { this.registry.set('runDeaths', 0); } catch (e) {}   // (用户成就) 一命通关计数清零
        SaveSystem.deleteSlot(n);          // 清空旧数据 (新游戏)
        SaveSystem.setCurrentSlot(n);      // deleteSlot 可能清 current, 重设
        this._fadeAndStart('StartIntroScene', null, true);   // 新游戏 → 重置 guide 已读
    }

    /** (用户) 难度选择面板: easy / normal / hard / extreme — 槽面板同款美术 */
    _showDifficultySelect(n) {
        // 不查/不设 _modalOpen — 本面板从槽面板内打开 (彼时 _modalOpen 已是 true)
        // 全部 setInteractive 不带 useHandCursor — Phaser 换/还原光标会把自定义 CSS 光标重置成 default, 看起来"鼠标不见了"
        const W = this.cameras.main.width, H = this.cameras.main.height;
        const items = [];
        const ov = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setDepth(5000).setInteractive();
        items.push(ov);
        const PW2 = 560, PH2 = 480;
        const panel = this.add.container(W / 2, H / 2).setDepth(5001);
        items.push(panel);
        const bg = this.add.rectangle(0, 0, PW2, PH2, 0x0a0a18, 0.97).setStrokeStyle(3, 0x6688aa).setInteractive();
        const title = this.add.text(0, -PH2 / 2 + 32, 'SELECT DIFFICULTY', {
            fontSize: '34px', color: '#ffcc55', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);
        panel.add([bg, title]);
        const defs = [
            { mode: 'easy',    label: 'EASY',    desc: 'The intended experience.',                         color: '#88ff88' },
            { mode: 'normal',  label: 'NORMAL',  desc: '3 hearts \u00b7 tougher foes \u00b7 faster corrosion.',     color: '#ffee88' },
            { mode: 'hard',    label: 'HARD',    desc: '1 heart \u00b7 brutal foes \u00b7 pricier shop.',           color: '#ffaa66' },
            { mode: 'extreme', label: 'EXTREME', desc: '1 heart \u00b7 deadliest foes \u00b7 shrines no longer heal.', color: '#ff6666' }
        ];
        // (用户) Extreme 需通关全游戏 >=1 次解锁
        const _extremeLocked = !(window.AbyssDiff && AbyssDiff.isCleared && AbyssDiff.isCleared());
        defs.forEach((d, i) => {
            const y = -PH2 / 2 + 96 + i * 82;
            const locked = (d.mode === 'extreme') && _extremeLocked;
            const rowBg = this.add.rectangle(0, y, PW2 - 70, 70, locked ? 0x101018 : 0x14142a, 1)
                .setStrokeStyle(2, locked ? 0x333344 : 0x445577).setInteractive();
            if (!locked) {
                rowBg.on('pointerover', () => { rowBg.setFillStyle(0x1e1e3a, 1); rowBg.setStrokeStyle(2, 0x88aacc); });
                rowBg.on('pointerout',  () => { rowBg.setFillStyle(0x14142a, 1); rowBg.setStrokeStyle(2, 0x445577); });
            }
            const lbl = this.add.text(-(PW2 - 70) / 2 + 26, y - 14, d.label, {
                fontSize: '28px', color: locked ? '#555566' : d.color, fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0, 0.5);
            const sub = this.add.text(-(PW2 - 70) / 2 + 26, y + 16, locked ? 'Locked \u2014 clear the game once to unlock.' : d.desc, {
                fontSize: '16px', color: '#9999aa', fontFamily: '"VT323", monospace'
            }).setOrigin(0, 0.5);
            rowBg.on('pointerdown', () => {
                if (locked) return;   // (用户) 未解锁不可选
                if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this, 'Select');
                items.forEach(o => { try { o.destroy(); } catch (e) {} });
                this._startNewGameWithDifficulty(n, d.mode);
            });
            panel.add([rowBg, lbl, sub]);
        });
        const back = this.add.text(0, PH2 / 2 - 34, '[ BACK ]', {
            fontSize: '26px', color: '#ff8888', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setInteractive();
        back.on('pointerover', () => back.setColor('#ffffff'));
        back.on('pointerout',  () => back.setColor('#ff8888'));
        back.on('pointerdown', () => { items.forEach(o => { try { o.destroy(); } catch (e) {} }); });   // 返回槽面板
        panel.add(back);
    }

    _resumeSlot(n, data) {
        SaveSystem.setCurrentSlot(n);
        if (window.AbyssDiff) AbyssDiff.set((data && data.difficulty) || 'easy');   // (用户) 读档恢复难度
        // 恢复需要在 registry 里的标志 (跨场景持久)
        try { this.registry.set('pickaxeUpgraded', !!data.pickaxeUpgraded); } catch (e) {}
        try { this.registry.set('hasPetSpider', !!data.hasPetSpider); } catch (e) {}   // (用户) 宠物随档恢复
        try { this.registry.set('runDeaths', data.runDeaths || 0); } catch (e) {}   // (用户成就) 死亡计数随档
        this._fadeAndStart(data.scene || 'SafeZone1Scene', data, false);   // resume → 保留 guide
    }

    _openOptions() {
        if (this._modalOpen) return;
        // (用户) 标题设置 = 游戏内 Settings 同款面板 (视频/音频/按键/游戏页签), 仅去掉 "保存并退出"
        if (typeof SettingsSystem === 'undefined') return;
        if (!this.settingsSystem) {
            this.settingsSystem = new SettingsSystem(this, { titleMode: true });
            this.settingsSystem.init();
            const origClose = this.settingsSystem.close.bind(this.settingsSystem);
            this.settingsSystem.close = () => { origClose(); this._modalOpen = false; };
        }
        this._modalOpen = true;
        this.settingsSystem.open();
    }

    _openCredits() {
        if (this._modalOpen) return;
        this._modalOpen = true;
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;

        // (用户) 美化: 与成就面板同一套描金语言 — 双层边框 + 角色卡片 + 药丸按钮
        const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(900).setInteractive();
        const panel = this.add.container(W / 2, H / 2).setDepth(901);
        const PW = 600, PH = 560;
        const bg = this.add.rectangle(0, 0, PW, PH, 0x0b0b12, 0.98)
            .setStrokeStyle(2, 0x806020).setInteractive();   // 吸收面板内点击
        const inner = this.add.rectangle(0, 0, PW - 16, PH - 16, 0x000000, 0)
            .setStrokeStyle(1, 0xffcc44, 0.3);
        const title = this.add.text(0, -PH / 2 + 34, '★ CREDITS ★', {
            fontSize: '36px', color: '#ffd86a', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 5, letterSpacing: 4
        }).setOrigin(0.5);
        const divider = this.add.rectangle(0, -PH / 2 + 62, PW - 56, 1, 0x444458, 1);

        // 游戏名块
        const logo = this.add.text(0, -PH / 2 + 106, 'ABYSS MINER', {
            fontSize: '42px', color: '#88ccff', fontFamily: '"VT323", monospace',
            stroke: '#1a3550', strokeThickness: 6, letterSpacing: 6
        }).setOrigin(0.5);
        const tagline = this.add.text(0, -PH / 2 + 144, 'A Roguelike Mining Adventure', {
            fontSize: '19px', color: '#9aa6b5', fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);

        // 角色卡片
        const crew = [
            { role: 'PROGRAMMING',        name: 'Ang Yen Peng' },
            { role: 'BACKEND & DATABASE', name: 'Low Yong Yi' },
            { role: 'ART & LEVEL DESIGN', name: 'Dylan' },
        ];
        const cardItems = [];
        const CW = 500, CH = 80, startY = -PH / 2 + 206;   // (用户) 卡片加高到 80, 行距进一步拉开
        crew.forEach((c, i) => {
            const cy = startY + i * (CH + 16);
            const card = this.add.rectangle(0, cy, CW, CH, 0x1c1828, 1).setStrokeStyle(1, 0x6a5a2a, 1);
            const accent = this.add.rectangle(-CW / 2 + 3, cy, 5, CH, 0xffcc44, 1);
            const role = this.add.text(-CW / 2 + 22, cy - 26, c.role, {
                fontSize: '16px', color: '#ffcc44', fontFamily: '"VT323", monospace', letterSpacing: 2
            }).setOrigin(0, 0.5);
            const name = this.add.text(-CW / 2 + 22, cy + 9, c.name, {   // (用户) 名字再上移 5px
                fontSize: '26px', color: '#ffffff', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3, letterSpacing: 1
            }).setOrigin(0, 0.5);   // (用户) 名字距卡片底边留 ~10px, 字距 +1
            cardItems.push(card, accent, role, name);
        });

        // 页脚 + CLOSE 药丸按钮
        const foot = this.add.text(0, PH / 2 - 98, 'Built with Phaser 3', {
            fontSize: '17px', color: '#666677', fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);
        const btnBg = this.add.rectangle(0, PH / 2 - 52, 170, 44, 0x1c1828, 1)
            .setStrokeStyle(2, 0xffcc44, 0.9).setInteractive();
        const btnTxt = this.add.text(0, PH / 2 - 52, 'CLOSE', {
            fontSize: '26px', color: '#ffd86a', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3, letterSpacing: 3
        }).setOrigin(0.5);
        const doClose = () => { dim.destroy(); panel.destroy(); this._modalOpen = false; };
        btnBg.on('pointerover', () => { btnBg.setFillStyle(0x2a2438); btnTxt.setColor('#ffffff'); });
        btnBg.on('pointerout',  () => { btnBg.setFillStyle(0x1c1828); btnTxt.setColor('#ffd86a'); });
        btnBg.on('pointerdown', doClose);
        dim.on('pointerdown', doClose);   // 点外侧暗区也可关

        panel.add([bg, inner, title, divider, logo, tagline, ...cardItems, foot, btnBg, btnTxt]);
    }
}