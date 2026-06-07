/**
 * TitleScene — 起始标题页面
 * Hollow Knight 风格：暗黑背景 + 大标题 + 居中菜单按钮
 * 按钮：START / TUTORIAL / QUIT
 */
class TitleScene extends Phaser.Scene {
    constructor() { super('TitleScene'); }

    preload() {
        // (用户) boot 加载层进度驱动
        this.load.on('progress', p => { if (window.AzmLoading) window.AzmLoading.setProgress(p); });
        if (typeof AudioSystem !== 'undefined') AudioSystem.loadAll(this);  // 加载全部音频
        // 标题页背景图（洞穴）
        this.load.image('Tittle_scene_background_image', 'assets/images/Tittle_scene_background_image.png');
        this.load.image('Mouse_cursor', 'assets/images/Mouse_cursor.png');   // (用户) Title 精灵光标用
        this.load.image('Crystal', 'assets/images/Crystal.png');   // (用户) 存档行图标 (局中蓝水晶)
        this.load.image('YCrystal', 'assets/images/YCrystal.png');   // (用户) RECORDS 图标 (通关统计为黄水晶)
        this.load.image('Heart', 'assets/images/Heart.png');
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

        // (用户) 设置系统每次进 Title 重建 — 场景实例复用会让 this.settingsSystem 揣着上一轮的旧面板
        //   (对象已随场景销毁、数值是过期快照), 这就是 Title 设置与局内设置"不联通"的根源;
        //   顺带亮度等持久化设置一进标题页即应用, 不用等开一次 OPTIONS
        if (typeof SettingsSystem !== 'undefined') {
            this.settingsSystem = new SettingsSystem(this, { titleMode: true });
            this.settingsSystem.init();
            const origClose = this.settingsSystem.close.bind(this.settingsSystem);
            this.settingsSystem.close = () => { origClose(); this._modalOpen = false; };
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
            { label: 'RECORDS',     action: () => this._openRecords() },   // (用户) 通关记录
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

        // (用户) 开局加载层撤除 — Title 此刻已渲染
        this.time.delayedCall(50, () => { if (window.AzmLoading) window.AzmLoading.hide(); });

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
            // (用户) 统一加载层 (带进度条) — 新场景 preload 进度实时驱动; 摘除机制沿用下方原逻辑
            let div = (window.AzmLoading ? window.AzmLoading.show('Loading...') : null);
            if (window.AzmLoading) window.AzmLoading.setProgress(0);
            if (div) {
                div.style.cursor = 'url(assets/images/Mouse_cursor.png) 32 32, default';   // (用户修复) 过场鼠标可见
                try {
                    // (用户修复) 动态密度: 局内精灵 = 64 游戏px × 画布缩放; 这里按同公式算 CSS 显示尺寸, 逐像素一致
                    const _cv = this.game.canvas;
                    const _sc = _cv && _cv.clientWidth ? (_cv.clientWidth / _cv.width) : 1;
                    const _hot = Math.round(32 * _sc);
                    div.style.cursor = '-webkit-image-set(url(assets/images/Mouse_cursor.png) ' + (1 / _sc).toFixed(3) + 'x) ' + _hot + ' ' + _hot + ', default';
                } catch (e) {}
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
        // (用户) 描金语言统一: 双层边框 + 分隔线
        const bg = this.add.rectangle(0, 0, PW, PH, 0x0b0b12, 0.98).setStrokeStyle(2, 0x806020).setInteractive();   // (用户修复) 面板缝隙也不能穿透
        const inner = this.add.rectangle(0, 0, PW - 16, PH - 16, 0x000000, 0).setStrokeStyle(1, 0xffcc44, 0.3);
        const title = this.add.text(0, -PH / 2 + 32, '★ SELECT SAVE ★', {
            fontSize: '34px', color: '#ffd86a', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5);
        const divider = this.add.rectangle(0, -PH / 2 + 58, PW - 56, 1, 0x444458, 1);
        panel.add([bg, inner, title, divider]);

        const N = SaveSystem.NUM_SLOTS || 3;
        let rowItems = [];

        const buildSlots = () => {
            rowItems.forEach(o => { try { o.destroy(); } catch (e) {} });
            rowItems = [];
            for (let i = 1; i <= N; i++) {
                const y = -120 + (i - 1) * 92;
                const data = SaveSystem.getSlot(i);

                // (用户) 卡片化: 有档=暖紫底金描边+金竖条, 空档=深灰底
                const has = !!data;
                // (用户) 空档 = 蓝色系 (回归旧版观感); 有档 = 暖紫底金描边
                const rowBg = this.add.rectangle(0, y, PW - 80, 78, has ? 0x1c1828 : 0x14202e, 1)
                    .setStrokeStyle(1, has ? 0x6a5a2a : 0x33557a).setInteractive();
                rowBg.on('pointerover', () => rowBg.setFillStyle(has ? 0x2a2438 : 0x1c2c42, 1));
                rowBg.on('pointerout',  () => rowBg.setFillStyle(has ? 0x1c1828 : 0x14202e, 1));
                const accent = this.add.rectangle(-(PW - 80) / 2 + 3, y, 5, 78, has ? 0xffcc44 : 0x4488cc, 1);

                const slotLbl = this.add.text(-PW / 2 + 60, y - 16, 'SLOT ' + i, {
                    fontSize: '24px', color: has ? '#ffd86a' : '#88bbee', fontFamily: '"VT323", monospace',
                    stroke: '#000', strokeThickness: 3
                }).setOrigin(0, 0.5);

                rowItems.push(rowBg, accent, slotLbl);

                if (data) {
                    const zone = SaveSystem.zoneName(data.scene);
                    // (用户) 阵亡存档: 红色 FALLEN 标记; 普通档改图标: Crystal/Heart 贴图缩小 18px + 数字最亮白
                    let info;
                    if (data.dead) {
                        info = this.add.text(-PW / 2 + 62, y + 14, zone + '    \u2620 FALLEN', {
                            fontSize: '18px', color: '#ff6666', fontFamily: '"VT323", monospace'
                        }).setOrigin(0, 0.5);
                    } else {
                        const x0 = -PW / 2 + 62;   // (用户) 信息整行右移 2px
                        info = this.add.text(x0, y + 14, zone, {
                            fontSize: '18px', color: '#dddddd', fontFamily: '"VT323", monospace'
                        }).setOrigin(0, 0.5);
                        let ix = x0 + 130;
                        const ci = this.textures.exists('Crystal')
                            ? this.add.image(ix, y + 17, 'Crystal').setDisplaySize(18, 18)   // (用户) 水晶贴图下移 3px
                            : this.add.text(ix, y + 14, '\u25C6', { fontSize: '18px', color: '#88ccff', fontFamily: '"VT323", monospace' }).setOrigin(0.5);
                        const cN = this.add.text(ix + 14, y + 14, String(data.crystalCount || 0), {
                            fontSize: '18px', color: '#ffffff', fontFamily: '"VT323", monospace'
                        }).setOrigin(0, 0.5);
                        ix += 62;
                        if ((data.yellowCrystalCount | 0) > 0) {   // (用户) 档内已获得黄水晶 → 槽位也显示
                            const yi = this.textures.exists('YCrystal')
                                ? this.add.image(ix, y + 17, 'YCrystal').setDisplaySize(18, 18)   // 贴图下移 3px
                                : this.add.text(ix, y + 14, '\u25C6', { fontSize: '18px', color: '#ffcc33', fontFamily: '"VT323", monospace' }).setOrigin(0.5);
                            const yN = this.add.text(ix + 14, y + 14, String(data.yellowCrystalCount | 0), {
                                fontSize: '18px', color: '#ffffff', fontFamily: '"VT323", monospace'
                            }).setOrigin(0, 0.5);
                            rowItems.push(yi, yN);
                            ix += 62;
                        }
                        ix += 18;
                        const hi = this.textures.exists('Heart')
                            ? this.add.image(ix, y + 14, 'Heart').setDisplaySize(18, 18)
                            : this.add.text(ix, y + 14, '\u2665', { fontSize: '18px', color: '#ff5577', fontFamily: '"VT323", monospace' }).setOrigin(0.5);
                        const hN = this.add.text(ix + 14, y + 14, String(data.hearts || 0), {
                            fontSize: '18px', color: '#ffffff', fontFamily: '"VT323", monospace'
                        }).setOrigin(0, 0.5);
                        rowItems.push(ci, cN, hi, hN);
                        if (data.difficulty) {
                            // (用户) 难度标签着色 — 与选难度页同色
                            const _dc = { easy: '#88ff88', normal: '#ffee88', hard: '#ffaa66', extreme: '#ff6666' }[String(data.difficulty).toLowerCase()] || '#dddddd';
                            const dT = this.add.text(ix + 80, y + 14, '[' + String(data.difficulty).toUpperCase() + ']', {
                                fontSize: '18px', color: _dc, fontFamily: '"VT323", monospace'
                            }).setOrigin(0, 0.5);
                            rowItems.push(dT);
                        }
                    }
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
                    rowItems.push(info, tstamp, del);   // info=区名(或FALLEN), 图标数字已在分支内 push
                } else {
                    const info = this.add.text(-PW / 2 + 62, y + 14, '- Empty -  (click to start new)', {
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

        // (用户) BACK 药丸按钮 (与 CREDITS 同款)
        const backBg = this.add.rectangle(0, PH / 2 - 42, 170, 44, 0x1c1828, 1)
            .setStrokeStyle(2, 0xffcc44, 0.9).setInteractive();
        const backTxt = this.add.text(0, PH / 2 - 42, 'BACK', {
            fontSize: '26px', color: '#ffd86a', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);
        backBg.on('pointerover', () => { backBg.setFillStyle(0x2a2438); backTxt.setColor('#ffffff'); });
        backBg.on('pointerout',  () => { backBg.setFillStyle(0x1c1828); backTxt.setColor('#ffd86a'); });
        backBg.on('pointerdown', () => { dim.destroy(); panel.destroy(); this._modalOpen = false; });
        panel.add([backBg, backTxt]);
    }

    // dev 菜单直接跳场景 (不绑存档位, 清空 current 避免污染真存档)
    // (用户) 通关记录面板 — 金框风格, 空态提示, 超出滚轮+滚动条
    _openRecords() {
        if (this._modalOpen || this._fading) return;
        this._modalOpen = true;
        const W = this.cameras.main.width, H = this.cameras.main.height;
        const PW = 720, PH = 520;
        const items = [];
        const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setDepth(900).setInteractive();
        const panel = this.add.container(W / 2, H / 2).setDepth(901);
        items.push(dim, panel);
        let onWheel = () => {};
        const close = () => {
            this.input.off('wheel', onWheel);
            items.forEach(o => { try { o.destroy(); } catch (e) {} });
            this._modalOpen = false;
        };
        // (用户) 点面板外空地不再关闭 — 仅 \u2715 可关 (dim 保持 interactive 吞点击)
        const bg = this.add.rectangle(0, 0, PW, PH, 0x0b0b12, 0.97).setStrokeStyle(2, 0x806020).setInteractive();   // 吞内部点击
        const inner = this.add.rectangle(0, 0, PW - 10, PH - 10, 0x000000, 0).setStrokeStyle(1, 0xffcc44, 0.3);
        const title = this.add.text(0, -PH / 2 + 34, '\u2605 RECORDS \u2605', {
            fontSize: '30px', color: '#ffd86a', fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);
        const divider = this.add.rectangle(0, -PH / 2 + 58, PW - 60, 2, 0x806020, 1);
        const xBtn = this.add.text(PW / 2 - 26, -PH / 2 + 26, '\u2715', {
            fontSize: '24px', color: '#ff7766', fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setInteractive();
        xBtn.on('pointerover', () => xBtn.setColor('#ffaa99'));
        xBtn.on('pointerout',  () => xBtn.setColor('#ff7766'));
        xBtn.on('pointerdown', close);
        panel.add([bg, inner, title, divider, xBtn]);

        let recs = [];
        try { recs = JSON.parse(localStorage.getItem('abyssMinerClearRecords') || '[]'); } catch (e) {}

        if (!recs.length) {
            const empty = this.add.text(0, 16, 'No records yet.\nClear the game to write history!', {
                fontSize: '22px', color: '#9aa0b0', fontFamily: '"VT323", monospace', align: 'center', lineSpacing: 8
            }).setOrigin(0.5);
            panel.add(empty);
            this.input.on('wheel', onWheel);
            return;
        }

        // (用户) 三种排序: 最新 / 水晶最多 / 用时最短
        const TABS = [
            { key: 'latest',   label: 'LATEST' },
            { key: 'crystals', label: 'CRYSTALS' },
            { key: 'fastest',  label: 'FASTEST' }
        ];
        const sortRecs = mode => {
            if (mode === 'crystals') return [...recs].sort((a, b) => (b.crystals | 0) - (a.crystals | 0));
            if (mode === 'fastest')  return [...recs].sort((a, b) => {
                const ta = (typeof a.timeMs === 'number') ? a.timeMs : Infinity;
                const tb = (typeof b.timeMs === 'number') ? b.timeMs : Infinity;
                return ta - tb;
            });
            return recs.slice();   // latest: 落盘即最新在前
        };
        const VIEW_TOP = -PH / 2 + 102, VIEW_H = PH - 102 - 44;
        const ROW_H = 56, GAP = 6;
        const fmtDate = ts => { const d = new Date(ts); const p = n => (n < 10 ? '0' : '') + n;
            return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
        const _fmtT = ms => { ms = ms | 0; const m = Math.floor(ms / 60000), s2 = Math.floor(ms / 1000) % 60; return m + ':' + (s2 < 10 ? '0' : '') + s2; };
        const gColor = g => ({ S: '#ffcc44', A: '#88dd66', B: '#66aaff', C: '#cccccc', D: '#aa6666' })[g] || '#cccccc';

        const list = this.add.container(0, 0);
        panel.add(list);
        const mg = this.make.graphics({}, false);
        mg.fillStyle(0xffffff, 1);
        mg.fillRect(W / 2 - (PW - 60) / 2, H / 2 + VIEW_TOP, PW - 60, VIEW_H);
        list.setMask(mg.createGeometryMask());
        items.push(mg);

        let scroll = 0, maxScroll = 0;
        const sbItems = [];   // 滚动条件 (随排序重建)
        let syncThumb = () => {};
        onWheel = (p, objs, wx, wy) => {
            if (maxScroll <= 0) return;
            scroll = Phaser.Math.Clamp(scroll + wy * 0.6, 0, maxScroll);
            list.y = -scroll; syncThumb();
        };

        const buildList = mode => {
            list.removeAll(true);
            sbItems.forEach(o => { try { o.destroy(); } catch (e) {} });
            sbItems.length = 0;
            scroll = 0; list.y = 0;
            const arr = sortRecs(mode);
            arr.forEach((r, i) => {
                const ry = VIEW_TOP + 8 + ROW_H / 2 + i * (ROW_H + GAP);
                const card = this.add.rectangle(0, ry, PW - 70, ROW_H, 0x1c1828, 1).setStrokeStyle(1, 0x6a5a2a);
                const bar = this.add.rectangle(-(PW - 70) / 2 + 3, ry, 4, ROW_H, 0xffcc44, 1);
                const gT = this.add.text(-(PW - 70) / 2 + 34, ry, r.grade || '-', {
                    fontSize: '32px', color: gColor(r.grade), fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 4, resolution: 2
                }).setOrigin(0.5);
                const main = this.add.text(-(PW - 70) / 2 + 64, ry - 11, 'CLEARED  ', {
                    fontSize: '20px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2
                }).setOrigin(0, 0.5);
                // (用户) 难度标签着色 — 与选难度页同色
                const _dc = { easy: '#88ff88', normal: '#ffee88', hard: '#ffaa66', extreme: '#ff6666' }[String(r.difficulty || '').toLowerCase()] || '#dddddd';
                const diffT = this.add.text(main.x + main.width, ry - 11, '[' + String(r.difficulty || '').toUpperCase() + ']', {
                    fontSize: '20px', color: _dc, fontFamily: '"VT323", monospace', resolution: 2
                }).setOrigin(0, 0.5);
                list.add(diffT);
                const sub = this.add.text(-(PW - 70) / 2 + 64, ry + 12,
                    fmtDate(r.at) + '    Deaths ' + (r.deaths | 0) + (typeof r.timeMs === 'number' ? '    Time ' + _fmtT(r.timeMs) : ''), {
                    fontSize: '16px', color: '#9aa0b0', fontFamily: '"VT323", monospace', resolution: 2
                }).setOrigin(0, 0.5);
                list.add([card, bar, gT, main, sub]);
                const cxr = (PW - 70) / 2 - 92;
                const _recTex = this.textures.exists('YCrystal') ? 'YCrystal' : (this.textures.exists('Crystal') ? 'Crystal' : null);
                if (_recTex) list.add(this.add.image(cxr, ry + 3, _recTex).setDisplaySize(20, 20));   // (用户) 水晶贴图下移 3px
                list.add(this.add.text(cxr + 16, ry, String(r.crystals | 0), {
                    fontSize: '20px', color: '#ffffff', fontFamily: '"VT323", monospace', resolution: 2
                }).setOrigin(0, 0.5));
            });
            const contentH = arr.length * (ROW_H + GAP) + 16;
            maxScroll = Math.max(0, contentH - VIEW_H);
            syncThumb = () => {};
            if (maxScroll > 0) {
                const track = this.add.rectangle(PW / 2 - 18, VIEW_TOP + VIEW_H / 2, 8, VIEW_H, 0x222230, 1);
                const thH = Math.max(36, VIEW_H * VIEW_H / contentH);
                const thumb = this.add.rectangle(PW / 2 - 18, VIEW_TOP + thH / 2, 8, thH, 0xffcc44, 1).setInteractive({ draggable: true });
                panel.add([track, thumb]);
                sbItems.push(track, thumb);
                syncThumb = () => { thumb.y = VIEW_TOP + thH / 2 + (VIEW_H - thH) * (maxScroll ? scroll / maxScroll : 0); };
                thumb.on('drag', (p, dx, dy) => {
                    const t = Phaser.Math.Clamp((dy - (VIEW_TOP + thH / 2)) / Math.max(1, VIEW_H - thH), 0, 1);
                    scroll = t * maxScroll; list.y = -scroll; syncThumb();
                });
            }
        };

        // (用户) 排序段选钮 — 金色药丸样式 (CLOSE/YES/NO 同款语言): 当前项填金 + 深色字, 一眼可辨
        let activeTab = 'latest';
        const tabBtns = [];
        const styleTabs = () => {
            tabBtns.forEach(b => {
                const on = b._key === activeTab;
                b.bg.setFillStyle(on ? 0xffd86a : 0x1c1828, 1);
                b.bg.setStrokeStyle(2, on ? 0xffe9a8 : 0x6a5a2a);
                b.txt.setColor(on ? '#1a1208' : '#8a8a99');
            });
        };
        TABS.forEach((t, i) => {
            const bx = -190 + i * 190, by = -PH / 2 + 84;
            const bg = this.add.rectangle(bx, by, 160, 34, 0x1c1828, 1).setStrokeStyle(2, 0x6a5a2a).setInteractive();
            const txt = this.add.text(bx, by, t.label, {
                fontSize: '20px', color: '#8a8a99', fontFamily: '"VT323", monospace', resolution: 2
            }).setOrigin(0.5);
            const btn = { _key: t.key, bg, txt };
            bg.on('pointerover', () => { if (activeTab !== btn._key) { bg.setFillStyle(0x262036, 1); txt.setColor('#cfcfdd'); } });
            bg.on('pointerout',  () => styleTabs());
            bg.on('pointerdown', () => {
                if (activeTab === btn._key) return;
                activeTab = btn._key;
                styleTabs();
                buildList(activeTab);
            });
            tabBtns.push(btn);
            panel.add([bg, txt]);
        });
        styleTabs();

        // 底部说明
        const note = this.add.text(0, PH / 2 - 20, 'Only the latest 30 runs are recorded.', {
            fontSize: '16px', color: '#8a8a99', fontFamily: '"VT323", monospace', resolution: 2
        }).setOrigin(0.5);
        panel.add(note);

        buildList(activeTab);
        this.input.on('wheel', onWheel);
    }

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
            const sub = this.add.text(-(PW2 - 70) / 2 + 28, y + 16, locked ? 'Locked \u2014 clear the game once to unlock.' : d.desc, {   // (用户) 描述行右移 2px — 与存档 SLOT 下信息行同规
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
        // (用户) Tutorial 阶段的档 → 从开局图文故事 (StartIntro) 重新开始, 不直接跳进剧情半途
        const _tut = (data.scene === 'TutorialScene');
        this._fadeAndStart(_tut ? 'StartIntroScene' : (data.scene || 'SafeZone1Scene'), _tut ? null : data, false);   // resume → 保留 guide
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
        const CW = 500, CH = 70, startY = -PH / 2 + 206;   // (用户) 卡片 74→70
        crew.forEach((c, i) => {
            const cy = startY + i * (CH + 16);
            const card = this.add.rectangle(0, cy, CW, CH, 0x1c1828, 1).setStrokeStyle(1, 0x6a5a2a, 1);
            const accent = this.add.rectangle(-CW / 2 + 3, cy, 5, CH, 0xffcc44, 1);
            const role = this.add.text(-CW / 2 + 22, cy - 18, c.role, {
                fontSize: '18px', color: '#ffcc44', fontFamily: '"VT323", monospace'   // (用户) 字距走 main.js 全局补丁 (≤18px 自动 +1px)
            }).setOrigin(0, 0.5);
            const name = this.add.text(-CW / 2 + 20, cy + 7, c.name, {   // (用户) 下移 3px
                fontSize: '26px', color: '#ffffff', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            }).setOrigin(0, 0.5);
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
        // (用户) 点外侧暗区不再关闭 — 仅 CLOSE 按钮可关 (dim 保持 interactive 吞点击)

        panel.add([bg, inner, title, divider, logo, tagline, ...cardItems, foot, btnBg, btnTxt]);
    }
}