/**
 * SettingsSystem — 游戏设定面板（Hollow Knight 风格）
 *
 * 功能：
 *  - 画面：亮度、全屏
 *  - 按键：重新绑定所有操作键
 *  - 音频：音乐 / 音效音量（占位，可后期接入）
 *  - 游戏：保存并退出
 *
 * 用法：
 *   scene.settingsSystem = new SettingsSystem(scene);
 *   scene.settingsSystem.init();
 *   scene.settingsSystem.toggle();  // 开关面板
 */
class SettingsSystem {
    constructor(scene, opts) {
        this.titleMode = !!(opts && opts.titleMode);   // (用户) 标题界面模式: 不显示 保存并退出
        this.scene = scene;
        this.isOpen = false;
        this.panel  = null;
        this._currentTab = 'video';  // video / controls / audio / game

        // 持久化设定（存 localStorage）
        this.settings = this._loadSettings();

        // 重新绑定时的监听器
        this._rebindTarget = null;  // { actionKey, labelObj }
        this._rebindListener = null;

        // 默认按键绑定
        this.DEFAULT_BINDS = {
            'Move Left':     'A',
            'Move Right':    'D',
            'Jump':          'SPACE',
            'Crouch / Drop': 'S',
            'Dash':          'SHIFT',
            'Interact':      'E',
            'Switch Hand':   'F',
            'Quick Slot Z':  'Z',
            'Quick Slot X':  'X',
            'Quick Slot C':  'C',
            'Open Backpack': 'B',
        };
    }

    _loadSettings() {
        const defaults = {
            brightness: 100,
            fullscreen: false,
            musicVol: 80,
            sfxVol: 80,
            shake: true,
            fog: true,
        };
        try {
            const saved = JSON.parse(localStorage.getItem('abyssMinerSettings') || '{}');
            return { ...defaults, ...saved };
        } catch { return defaults; }
    }

    _saveSettings() {
        try { localStorage.setItem('abyssMinerSettings', JSON.stringify(this.settings)); } catch {}
    }

    // ═══════════════════════════════════════════════════
    //  初始化
    // ═══════════════════════════════════════════════════
    init() {
        this._buildPanel();
        this._applyBrightness(this.settings.brightness);
    }

    // ═══════════════════════════════════════════════════
    //  构建面板
    // ═══════════════════════════════════════════════════
    _buildPanel() {
        const s = this.scene;
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;
        const PW = 760, PH = 560;

        this.panel = s.add.container(W / 2, H / 2)
            .setScrollFactor(0).setDepth(980).setVisible(false);

        // 暗色遮罩 (0.45 — 别太黑, 否则会盖住亮度遮罩的预览效果)
        const dimmer = s.add.rectangle(0, 0, W * 2, H * 2, 0x000000, 0.45)
            .setScrollFactor(0);
        // 面板背景
        const bg = s.add.rectangle(0, 0, PW, PH, 0x0d0d0d, 0.97)
            .setStrokeStyle(1, 0x444444);

        // 标题
        const titleTxt = s.add.text(0, -PH / 2 + 26, 'SETTINGS', {
            fontSize: '34px', color: '#ffffff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 5,
            letterSpacing: 8
        }).setOrigin(0.5);

        const closeBtn = s.add.text(PW / 2 - 20, -PH / 2 + 20, '✕', {
            fontSize: '26px', color: '#ff5555', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', () => this.close());
        closeBtn.on('pointerover', () => closeBtn.setColor('#ff2222'));
        closeBtn.on('pointerout',  () => closeBtn.setColor('#ff5555'));

        // 分割线
        const divH = s.add.rectangle(0, -PH / 2 + 52, PW - 40, 1, 0x333333, 1);

        this.panel.add([dimmer, bg, titleTxt, closeBtn, divH]);

        // ── 左侧标签栏 ──────────────────────────────────────
        this._tabs = {};
        const tabDefs = [
            { key: 'video',    label: '▶ DISPLAY'  },
            { key: 'audio',    label: '▶ AUDIO'    },
            { key: 'game',     label: '▶ GAME'     },
        ];
        const tabX = -PW / 2 + 30;
        const tabStartY = -PH / 2 + 90;
        for (let i = 0; i < tabDefs.length; i++) {
            const { key, label } = tabDefs[i];
            const ty = tabStartY + i * 52;
            const tb = s.add.text(tabX, ty, label, {
                fontSize: '24px', color: '#bbbbbb', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            }).setOrigin(0, 0.5).setInteractive();
            tb.on('pointerover', () => { if (this._currentTab !== key) tb.setColor('#ffffff'); });
            tb.on('pointerout',  () => { if (this._currentTab !== key) tb.setColor('#bbbbbb'); });
            tb.on('pointerdown', () => this._switchTab(key));
            this._tabs[key] = tb;
            this.panel.add(tb);
        }

        // 左侧竖线 — 移到 200px 给 tab 留空间
        const sideDiv = s.add.rectangle(-PW / 2 + 200, 30, 1, PH - 100, 0x444444, 1);
        this.panel.add(sideDiv);

        // ── 右侧内容区（容器）位置在分割线右边 20px ─────────────
        this._contentContainer = s.add.container(-PW / 2 + 220, -PH / 2 + 90);
        this.panel.add(this._contentContainer);

        // 构建各 tab 内容
        this._buildVideoTab();
        this._buildAudioTab();
        this._buildGameTab();

        // 默认显示 video
        this._switchTab('video');
    }

    // ─── VIDEO TAB ──────────────────────────────────────
    _buildVideoTab() {
        const s = this.scene;
        this._videoItems = [];

        const SLIDER_X = 200;       // 滑块起点 x（局部坐标）
        const SLIDER_W = 220;
        const VAL_X = SLIDER_X + SLIDER_W + 20;  // 数值文字 x

        // 亮度
        const bLabel = s.add.text(0, 0, 'Brightness', {
            fontSize: '22px', color: '#dddddd', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        });

        const slTrack = s.add.rectangle(SLIDER_X, 16, SLIDER_W, 6, 0x333333, 1).setOrigin(0, 0.5);
        const slFill  = s.add.rectangle(SLIDER_X, 16, SLIDER_W * this.settings.brightness / 100, 6, 0x66aaff, 1).setOrigin(0, 0.5);
        const slHandle = s.add.circle(SLIDER_X + SLIDER_W * this.settings.brightness / 100, 16, 9, 0xffffff, 1);
        // 整个轨道区域可交互（点击或拖动都行）
        const slHitZone = s.add.rectangle(SLIDER_X + SLIDER_W / 2, 16, SLIDER_W + 24, 24, 0x000000, 0).setInteractive();
        this._brightnessValue = s.add.text(VAL_X, 0, this.settings.brightness + '%', {
            fontSize: '22px', color: '#ffffff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        });

        // 滑块拖动逻辑（panel 在屏幕中心 W/2, container 是其子级 → 世界x = panel.x + container.x）
        const updateSlider = (pointerX) => {
            const localX = pointerX - (this.panel.x + this._contentContainer.x);
            const val = Phaser.Math.Clamp(Math.round((localX - SLIDER_X) / SLIDER_W * 100), 0, 100);
            this.settings.brightness = val;
            this._brightnessValue.setText(val + '%');
            slFill.setSize(SLIDER_W * val / 100, 6);
            slHandle.setPosition(SLIDER_X + SLIDER_W * val / 100, 16);
            this._applyBrightness(val);
            this._saveSettings();
        };

        let dragging = false;
        slHitZone.on('pointerdown', (ptr) => { dragging = true; updateSlider(ptr.x); });
        s.input.on('pointermove', (ptr) => { if (dragging && this.isOpen && this._currentTab === 'video') updateSlider(ptr.x); });
        s.input.on('pointerup',   () => { dragging = false; });

        // 全屏
        const fsLabel = s.add.text(0, 60, 'Fullscreen', {
            fontSize: '22px', color: '#dddddd', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        });
        this._fsToggle = s.add.text(SLIDER_X, 60, this.settings.fullscreen ? '[ ON ]' : '[ OFF ]', {
            fontSize: '22px', color: this.settings.fullscreen ? '#44ff88' : '#ff6644',
            fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 3
        }).setInteractive();
        this._fsToggle.on('pointerover', () => this._fsToggle.setAlpha(0.8));
        this._fsToggle.on('pointerout',  () => this._fsToggle.setAlpha(1));
        this._fsToggle.on('pointerdown', () => this._toggleFullscreen());

        // 监听全屏变化（ESC 退出全屏后同步状态）
        // (用户) ScaleManager 是全局对象, 监听器跨场景重启永生 → 每轮挂新前先记引用, 场景 shutdown 时自清
        const _onEnterFs = () => this._syncFullscreenState(true);
        const _onLeaveFs = () => this._syncFullscreenState(false);
        this.scene.scale.on('enterfullscreen', _onEnterFs);
        this.scene.scale.on('leavefullscreen', _onLeaveFs);
        this.scene.events.once('shutdown', () => {
            try { this.scene.scale.off('enterfullscreen', _onEnterFs); this.scene.scale.off('leavefullscreen', _onLeaveFs); } catch (e) {}
        });

        // 画面震动开关
        const shLabel = s.add.text(0, 120, 'Screen Shake', {
            fontSize: '22px', color: '#dddddd', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        });
        const shOn = this.settings.shake !== false;
        this._shakeToggle = s.add.text(SLIDER_X, 120, shOn ? '[ ON ]' : '[ OFF ]', {
            fontSize: '22px', color: shOn ? '#44ff88' : '#ff6644',
            fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 3
        }).setInteractive();
        this._shakeToggle.on('pointerover', () => this._shakeToggle.setAlpha(0.8));
        this._shakeToggle.on('pointerout',  () => this._shakeToggle.setAlpha(1));
        this._shakeToggle.on('pointerdown', () => this._toggleShake());

        // (用户) 光影 (黑雾) 开关
        const fgLabel = s.add.text(0, 180, 'Lighting / Fog', {
            fontSize: '22px', color: '#dddddd', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        });
        const fgOn = this.settings.fog !== false;
        this._fogToggle = s.add.text(SLIDER_X, 180, fgOn ? '[ ON ]' : '[ OFF ]', {
            fontSize: '22px', color: fgOn ? '#44ff88' : '#ff6644',
            fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 3
        }).setInteractive();
        this._fogToggle.on('pointerover', () => this._fogToggle.setAlpha(0.8));
        this._fogToggle.on('pointerout',  () => this._fogToggle.setAlpha(1));
        this._fogToggle.on('pointerdown', () => this._toggleFog());

        this._videoItems.push(bLabel, slTrack, slFill, slHandle, slHitZone, this._brightnessValue,
                              fsLabel, this._fsToggle, shLabel, this._shakeToggle,
                              fgLabel, this._fogToggle);
        this._contentContainer.add(this._videoItems);
        this._videoItems.forEach(o => o.setVisible(false));
    }

    _syncFullscreenState(isFullscreen) {
        this.settings.fullscreen = isFullscreen;
        this._saveSettings();
        if (this._fsToggle) {
            this._fsToggle.setText(isFullscreen ? '[ ON ]' : '[ OFF ]')
                .setColor(isFullscreen ? '#44ff88' : '#ff6644');
        }
    }

    _toggleFullscreen() {
        this.settings.fullscreen = !this.settings.fullscreen;
        this._fsToggle.setText(this.settings.fullscreen ? 'ON' : 'OFF')
            .setColor(this.settings.fullscreen ? '#44ff88' : '#ff6644');
        if (this.settings.fullscreen) {
            this.scene.scale.startFullscreen();
        } else {
            this.scene.scale.stopFullscreen();
        }
        this._saveSettings();
    }

    _toggleShake() {
        this.settings.shake = !this.settings.shake;
        this._shakeToggle.setText(this.settings.shake ? '[ ON ]' : '[ OFF ]')
            .setColor(this.settings.shake ? '#44ff88' : '#ff6644');
        if (typeof window !== 'undefined') {
            window._abyssSettings = window._abyssSettings || {};
            window._abyssSettings.shake = this.settings.shake;
        }
        this._saveSettings();
        // 开启时给个短震动让用户立刻感受到反馈
        if (this.settings.shake && this.scene.cameras && this.scene.cameras.main) {
            try { this.scene.cameras.main.shake(180, 0.006); } catch (e) {}
        }
    }

    _toggleFog() {
        this.settings.fog = !(this.settings.fog !== false);
        const on = this.settings.fog;
        this._fogToggle.setText(on ? '[ ON ]' : '[ OFF ]').setColor(on ? '#44ff88' : '#ff6644');
        this._saveSettings();
        if (this.scene.fogSystem && this.scene.fogSystem.setEnabled) this.scene.fogSystem.setEnabled(on);
    }

    _applyBrightness(val) {
        // 0-100：用相机 flash 叠加全黑实现降低亮度
        // 简单实现：给相机添加一个 postFX overlay，val=100 → 无叠加，val=0 → 全黑
        const alpha = Math.pow((100 - val) / 100, 0.7) * 0.5;   // (用户) 幂曲线, 上限 0.5 (滑块 0 → 0.5 暗度, 50 → 约 0.31)
        if (!this._brightnessOverlay) {
            const s = this.scene;
            this._brightnessOverlay = s.add.rectangle(
                s.cameras.main.width / 2,
                s.cameras.main.height / 2,
                s.cameras.main.width * 4,
                s.cameras.main.height * 4,
                0x000000, 1   // (用户修复) fillAlpha 原来是 0 — setAlpha 是乘法 (0×任何值=0), 遮罩从未显示过, 这就是亮度滑块"没差别"的原因
            ).setScrollFactor(0).setDepth(811).setActive(true);   // (用户) 显示优先级仅高于黑雾 (810)
        }
        this._brightnessOverlay.setAlpha(alpha);
    }

    // ─── CONTROLS TAB ───────────────────────────────────
    _buildControlsTab() {
        const s = this.scene;
        const rows = Object.keys(this.DEFAULT_BINDS);
        this._controlItems = [];
        this._rebindLabels = {};

        rows.forEach((action, i) => {
            const y = i * 32;
            const aLbl = s.add.text(0, y, action, {
                fontSize: '20px', color: '#dddddd', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            });
            const key = localStorage.getItem('bind_' + action) || this.DEFAULT_BINDS[action];
            const kLbl = s.add.text(280, y, '[ ' + key + ' ]', {
                fontSize: '20px', color: '#66bbff', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            }).setInteractive();
            kLbl.on('pointerover', () => kLbl.setColor('#aaddff'));
            kLbl.on('pointerout',  () => {
                kLbl.setColor(this._rebindTarget?.action === action ? '#ffff66' : '#66bbff');
            });
            kLbl.on('pointerdown', () => this._startRebind(action, kLbl));
            this._controlItems.push(aLbl, kLbl);
            this._rebindLabels[action] = kLbl;
        });

        this._rebindHint = s.add.text(0, rows.length * 32 + 12, '', {
            fontSize: '18px', color: '#ffff55', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        });
        this._controlItems.push(this._rebindHint);

        // Reset 默认按钮
        const resetBtn = s.add.text(0, rows.length * 32 + 40, '[ Reset to Defaults ]', {
            fontSize: '18px', color: '#ff8866', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setInteractive();
        resetBtn.on('pointerover', () => resetBtn.setColor('#ffaa88'));
        resetBtn.on('pointerout',  () => resetBtn.setColor('#ff8866'));
        resetBtn.on('pointerdown', () => {
            for (const [action, defaultKey] of Object.entries(this.DEFAULT_BINDS)) {
                localStorage.removeItem('bind_' + action);
                if (this._rebindLabels[action]) {
                    this._rebindLabels[action].setText('[ ' + defaultKey + ' ]').setColor('#66bbff');
                }
            }
        });
        this._controlItems.push(resetBtn);

        this._contentContainer.add(this._controlItems);
        this._controlItems.forEach(o => o.setVisible(false));
    }

    _startRebind(action, lbl) {
        if (this._rebindTarget) this._cancelRebind();
        this._rebindTarget = { action, lbl };
        lbl.setText('[Press any key...]').setColor('#ffff00');
        this._rebindHint.setText('Press ESC to cancel');

        this._rebindListener = (event) => {
            event.stopImmediatePropagation();
            const keyName = event.key === ' ' ? 'SPACE' : event.key.toUpperCase();
            if (event.key === 'Escape') { this._cancelRebind(); return; }
            lbl.setText('[' + keyName + ']').setColor('#66bbff');
            try { localStorage.setItem('bind_' + action, keyName); } catch {}
            this._rebindTarget = null;
            this._rebindHint.setText('');
            document.removeEventListener('keydown', this._rebindListener, true);
            this._rebindListener = null;
        };
        document.addEventListener('keydown', this._rebindListener, true);
    }

    _cancelRebind() {
        if (!this._rebindTarget) return;
        const { action, lbl } = this._rebindTarget;
        const saved = localStorage.getItem('bind_' + action) || this.DEFAULT_BINDS[action];
        lbl.setText('[' + saved + ']').setColor('#66bbff');
        this._rebindTarget = null;
        this._rebindHint.setText('');
        if (this._rebindListener) {
            document.removeEventListener('keydown', this._rebindListener, true);
            this._rebindListener = null;
        }
    }

    // ─── AUDIO TAB ──────────────────────────────────────
    _buildAudioTab() {
        const s = this.scene;
        this._audioItems = [];

        const SLIDER_X = 200;
        const SLIDER_W = 220;
        const VAL_X = SLIDER_X + SLIDER_W + 20;

        const mkSlider = (label, settingKey, y, applyFn, sfxFeedback) => {
            const lbl = s.add.text(0, y, label, {
                fontSize: '22px', color: '#dddddd', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            });
            const val0 = this.settings[settingKey];
            const valTxt = s.add.text(VAL_X, y, val0 + '%', {
                fontSize: '22px', color: '#ffffff', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            });
            const trk = s.add.rectangle(SLIDER_X, y + 14, SLIDER_W, 6, 0x333333, 1).setOrigin(0, 0.5);
            const fill = s.add.rectangle(SLIDER_X, y + 14, SLIDER_W * val0 / 100, 6, 0x66aaff, 1).setOrigin(0, 0.5);
            const handle = s.add.circle(SLIDER_X + SLIDER_W * val0 / 100, y + 14, 9, 0xffffff, 1);
            const hit = s.add.rectangle(SLIDER_X + SLIDER_W / 2, y + 14, SLIDER_W + 24, 24, 0x000000, 0).setInteractive();

            const update = (px) => {
                const localX = px - (this.panel.x + this._contentContainer.x);
                const v = Phaser.Math.Clamp(Math.round((localX - SLIDER_X) / SLIDER_W * 100), 0, 100);
                this.settings[settingKey] = v;
                valTxt.setText(v + '%');
                fill.setSize(SLIDER_W * v / 100, 6);
                handle.setPosition(SLIDER_X + SLIDER_W * v / 100, y + 14);
                applyFn(v);
                this._saveSettings();
            };
            let dragging = false;
            hit.on('pointerdown', (p) => { dragging = true; update(p.x); });
            s.input.on('pointermove', (p) => { if (dragging && this.isOpen && this._currentTab === 'audio') update(p.x); });
            s.input.on('pointerup',   () => { if (dragging && sfxFeedback && typeof AudioSystem !== 'undefined') AudioSystem.sfx(s, 'Select'); dragging = false; });

            this._audioItems.push(lbl, valTxt, trk, fill, handle, hit);
        };

        // Music — 实时改 BGM 音量
        mkSlider('Music Volume', 'musicVol', 0, (v) => {
            if (typeof AudioSystem !== 'undefined') AudioSystem.setBgmVolume(v / 100 * 0.7);
            if (typeof window !== 'undefined' && window._abyssSettings) window._abyssSettings.musicVol = v;
        });
        // SFX — 实时改音效音量, 松手时播 Select 让用户听到当前音量
        mkSlider('Sound Effects', 'sfxVol', 60, (v) => {
            if (typeof AudioSystem !== 'undefined') AudioSystem.setSfxVolume(v / 100);
            if (typeof window !== 'undefined' && window._abyssSettings) window._abyssSettings.sfxVol = v;
        }, true);

        this._contentContainer.add(this._audioItems);
        this._audioItems.forEach(o => o.setVisible(false));
    }

    // ─── GAME TAB ───────────────────────────────────────
    _buildGameTab() {
        const s = this.scene;
        this._gameItems = [];

        if (!this.titleMode) {   // (用户) 标题界面没有"保存并退出" (还没开始玩游戏)
            const saveQuit = s.add.text(0, 20, '[ Save & Exit to Title ]', {
                fontSize: '24px', color: '#ffcc55', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            }).setInteractive();
            saveQuit.on('pointerover', () => saveQuit.setColor('#ffee99'));
            saveQuit.on('pointerout',  () => saveQuit.setColor('#ffcc55'));
            saveQuit.on('pointerdown', () => this._saveAndExit());
            this._gameItems.push(saveQuit);
        }

        const versionTxt = s.add.text(0, this.titleMode ? 20 : 100, 'Abyss Miner  v0.1 (alpha)', {   // (用户) 标题模式: 删掉保存键后上移补位
            fontSize: '18px', color: '#888888', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 2
        });

        const creditTxt = s.add.text(0, this.titleMode ? 50 : 130, 'A 2D mining adventure', {
            fontSize: '18px', color: '#666666', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 2
        });

        this._gameItems.push(versionTxt, creditTxt);
        this._contentContainer.add(this._gameItems);
        this._gameItems.forEach(o => o.setVisible(false));
    }

    _saveAndExit() {
        // (用户) Save&Exit 不抓当前状态 — 存档 = 最近一次快照 (入场出生点一次 + 各 checkpoint 首次进圈一次), 见 HealthSystem
        this._saveSettings();
        // 注意: 不在这里抓当前状态 — 存档以"进入区域时"的快照为准 (见各场景 autoSave),
        // 否则中途捡的东西会被存进去, 但 resume 又会刷新世界 → 可无限刷. 这里只负责退出.
        this.close();
        // 淡出到 TitleScene
        this.scene.cameras.main.fadeOut(600, 0, 0, 0, (cam, prog) => {
            if (prog === 1) {
                // (用户) 不再 physics.pause() — Arcade world 跨场景重启存活, isPaused 残留会让重进的场景物理冻结
                this.scene.scene.start('TitleScene');
            }
        });
    }

    // ─── Tab 切换 ─────────────────────────────────────────
    _switchTab(key) {
        if (this._rebindTarget) this._cancelRebind();
        this._currentTab = key;

        // 更新 tab 文字颜色
        for (const [k, tb] of Object.entries(this._tabs)) {
            tb.setColor(k === key ? '#ffff66' : '#bbbbbb');
        }

        const allGroups = {
            video:    this._videoItems,
            audio:    this._audioItems,
            game:     this._gameItems,
        };
        for (const [k, grp] of Object.entries(allGroups)) {
            grp.forEach(o => o.setVisible(k === key));
        }
    }

    // ═══════════════════════════════════════════════════
    //  开关面板
    // ═══════════════════════════════════════════════════
    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.panel.setVisible(true);
        if (this.scene._setUIPause) this.scene._setUIPause(true); else this.scene.physics.pause();   // (用户) 全场景暂停 (剧情/计时器/补间一并冻结)
        this.scene.game.canvas.style.cursor = 'url(assets/images/Mouse_cursor.png) 32 32, default';
        if (this.scene.crosshair) this.scene.crosshair.setVisible(false);
    }

    close() {
        if (!this.isOpen) return;
        if (this._rebindTarget) this._cancelRebind();
        this.isOpen = false;
        this.scene._suppressNextClick = true;
        this.panel.setVisible(false);
        if (this.scene._setUIPause) this.scene._setUIPause(false); else this.scene.physics.resume();
        // (用户) 标题界面没有准星 — 关闭后恢复自定义光标; 游戏内才隐藏(交给准星)
        this.scene.game.canvas.style.cursor = this.titleMode ? 'url(assets/images/Mouse_cursor.png) 32 32, default' : 'none';
        if (this.scene.crosshair) this.scene.crosshair.setVisible(true);
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    /** 供 uiCam.ignore() 使用 */
    getAllUIObjects() {
        const objs = [];
        if (this.panel) objs.push(this.panel);
        if (this._brightnessOverlay) objs.push(this._brightnessOverlay);
        return objs;
    }
}