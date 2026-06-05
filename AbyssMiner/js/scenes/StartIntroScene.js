/**
 * StartIntroScene
 * --------------------------------------------------
 * 玩家在 Title 点 START → 这个场景 → TutorialScene
 *
 * 4 张图片 (各 320×180, 显示放大 5x 到 1600×900):
 *   Intro1.png  主角沙发上看电视
 *   Intro2.png  电视画面 — 矿业公司倒闭新闻
 *   Intro3.png  废弃矿口 + 封锁布条
 *   Intro4.png  踩烂地面 + 掉进塌洞
 *
 * 字幕风格参考 Undertale: 黑底 + 居中文字, 按 SPACE/ENTER/click 推进。
 * 右上角 [ Skip >> ] 按钮, 点击后弹 Yes/No 确认:
 *   Yes → 立刻 fadeOut → TutorialScene
 *   No  → 关弹窗继续看
 * 全部播完也是 fadeOut → TutorialScene.
 */
class StartIntroScene extends Phaser.Scene {
    constructor() {
        super('StartIntroScene');
    }

    preload() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.loadAll(this);  // 加载全部音频
        // 4 张 intro 图 — 文件还没做也没关系, 缺图会自动 fallback 到纯黑底 + 文字
        this.load.image('Intro1', 'assets/images/Intro1.png');
        this.load.image('Intro2', 'assets/images/Intro2.png');
        this.load.image('Intro3', 'assets/images/Intro3.png');
        this.load.image('Intro4', 'assets/images/Intro4.png');
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.stopBGM();  // BGM
        const W = this.scale.width;   // 1600
        const H = this.scale.height;  // 900

        // 4 张图 + 字幕内容 — Undertale 风格, 第一人称, 简短
        this._slides = [
            {
                image: 'Intro1',
                lines: [
                    "It was supposed to be just another night.",
                    "Then the news came on..."
                ]
            },
            {
                image: 'Intro2',
                lines: [
                    "Crystalline Mining Co. — bankrupt.",
                    "Decades of work. Hundreds of jobs.",
                    "Mine, gone with them."
                ]
            },
            {
                image: 'Intro3',
                lines: [
                    "They sealed the tunnels and walked away.",
                    "But the crystals were still down there.",
                    "I had to see for myself."
                ]
            },
            {
                image: 'Intro4',
                lines: [
                    "One wrong step on rotten wood...",
                    "...and the floor remembered nothing of those who walked it."
                ]
            }
        ];
        this._slideIdx = 0;
        this._lineIdx = 0;
        this._confirmOpen = false;
        this._finishing = false;

        // 黑底
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000).setDepth(0);

        // === 布局 ===
        // 下方 1/4 (225px) 留给字幕, 上方 3/4 (675px) 显示图片
        // 图片 320×180 放大 3x → 960×540, 在上方区域居中
        const SUB_H = Math.floor(H / 4);          // 225 — 字幕区高度
        const IMG_AREA_H = H - SUB_H;             // 675 — 图片区高度
        const IMG_SCALE = 3;                       // 320*3=960, 180*3=540
        const imgY = IMG_AREA_H / 2;               // 337.5 — 图片区垂直中心

        // 图片 — 缺图自动 fallback 到灰矩形
        if (this.textures.exists('Intro1')) {
            this._imageGo = this.add.image(W / 2, imgY, 'Intro1');
            try {
                this._imageGo.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
            } catch (e) {}
            this._imageGo.setScale(IMG_SCALE).setDepth(1);
        } else {
            this._imageGo = this.add.rectangle(W / 2, imgY, 320 * IMG_SCALE, 180 * IMG_SCALE, 0x222233).setDepth(1);
            this._missingImagesWarning = this.add.text(W / 2, imgY, '[ Intro images not loaded ]', {
                fontSize: '20px', color: '#666666', fontFamily: '"VT323", monospace'
            }).setOrigin(0.5).setDepth(2);
        }

        // 字幕区背景 — 完整 1/4 高度黑条 (从 y=IMG_AREA_H 到 y=H)
        this.add.rectangle(W / 2, IMG_AREA_H + SUB_H / 2, W, SUB_H, 0x000000, 0.9).setDepth(3);

        // 字幕文字 — 在字幕区正中 (上方距图片底边 = 下方距屏幕底边)
        this._subtitle = this.add.text(W / 2, IMG_AREA_H + SUB_H / 2, '', {
            fontSize: '54px',
            color: '#ffffff',
            fontFamily: '"VT323", monospace',
            align: 'center',
            wordWrap: { width: W - 200 }
        }).setOrigin(0.5).setDepth(5);

        // 推进提示 (字幕区右下)
        this._continueHint = this.add.text(W - 30, H - 20, '[ Click / SPACE to continue ]', {
            fontSize: '16px',
            color: '#666666',
            fontFamily: '"VT323", monospace'
        }).setOrigin(1, 1).setDepth(5);

        // Skip 按钮 (右上角)
        this._skipButton = this.add.text(W - 30, 30, '[ Skip >> ]', {
            fontSize: '24px',
            color: '#ffaa44',
            fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(1, 0).setDepth(10);
        // 不用 useHandCursor — 否则 Phaser 会把 canvas.style.cursor 改成 'pointer' / hover-out 改成 'default',
        // 覆盖我们设的游戏 URL 鼠标。颜色变化已经够当 hover 反馈了。
        this._skipButton.setInteractive();
        this._skipButton.on('pointerover', () => this._skipButton.setColor('#ffff66'));
        this._skipButton.on('pointerout',  () => this._skipButton.setColor('#ffaa44'));
        this._skipButton.on('pointerdown', (pointer, lx, ly, ev) => {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            this._askSkip();
        });

        // 鼠标光标 — 局内同尺寸 (动态密度)
        this._applyGameCursor();

        // 推进交互: click / SPACE / ENTER
        // 打字中按一下 → 立刻把整行字补完; 打完后再按一下 → 推进到下一行/下一张
        const _advanceOrComplete = () => {
            if (this._confirmOpen || this._finishing) return;
            if (this._typingActive) {
                this._completeTyping();
            } else {
                this._nextLine();
            }
        };
        this.input.on('pointerdown', (pointer) => {
            if (this._confirmOpen) return;
            // 点 skip 按钮的不算
            const sb = this._skipButton;
            if (sb && sb.getBounds) {
                const b = sb.getBounds();
                if (pointer.x >= b.x && pointer.x <= b.x + b.width &&
                    pointer.y >= b.y && pointer.y <= b.y + b.height) return;
            }
            _advanceOrComplete();
        });
        this.input.keyboard.on('keydown-SPACE', _advanceOrComplete);
        this.input.keyboard.on('keydown-ENTER', _advanceOrComplete);

        // 渲染第一行 + 淡入
        this._showCurrentLine();
        this.cameras.main.fadeIn(800, 0, 0, 0);
    }

    _showCurrentLine() {
        const slide = this._slides[this._slideIdx];
        if (!slide) return;
        if (this._imageGo && this._imageGo.setTexture && this.textures.exists(slide.image)) {
            this._imageGo.setTexture(slide.image);
            try {
                this._imageGo.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
            } catch (e) {}
        }
        const lineText = slide.lines[this._lineIdx] || '';
        this._startTypewriter(lineText);
    }

    /** 启动打字机效果 — 一字一字蹦出 */
    _startTypewriter(fullText) {
        this._stopTypewriter();   // 先清掉旧 timer
        this._typingFull = fullText;
        this._typingIdx = 0;
        this._typingActive = true;
        this._subtitle.setText('');
        // 每个字 70ms — Undertale 标准的一半速度 (用户要求慢一倍)
        this._typingEvent = this.time.addEvent({
            delay: 70,
            loop: true,
            callback: () => {
                this._typingIdx++;
                this._subtitle.setText(this._typingFull.substring(0, this._typingIdx));
                if (this._typingIdx >= this._typingFull.length) {
                    this._stopTypewriter();
                    this._typingActive = false;
                }
            }
        });
    }

    /** 中断打字机 — 立刻显示整行 */
    _completeTyping() {
        if (!this._typingActive) return;
        this._stopTypewriter();
        if (this._typingFull) this._subtitle.setText(this._typingFull);
        this._typingActive = false;
    }

    /** 清掉打字 timer (内部) */
    _stopTypewriter() {
        if (this._typingEvent) {
            this._typingEvent.remove();
            this._typingEvent = null;
        }
    }

    _nextLine() {
        if (this._finishing) return;
        // 切行前先停止任何打字 timer (防 race)
        this._stopTypewriter();
        this._typingActive = false;

        const slide = this._slides[this._slideIdx];
        if (!slide) { this._finishIntro(); return; }
        if (this._lineIdx < slide.lines.length - 1) {
            // 同张图下一行字
            this._lineIdx++;
            this._showCurrentLine();
        } else {
            // 切下一张图 (短淡黑过渡)
            this._slideIdx++;
            this._lineIdx = 0;
            if (this._slideIdx >= this._slides.length) {
                this._finishIntro();
                return;
            }
            this.cameras.main.fadeOut(250, 0, 0, 0);
            this.time.delayedCall(260, () => {
                this._showCurrentLine();
                this.cameras.main.fadeIn(250, 0, 0, 0);
            });
        }
    }

    // (用户) 局内同尺寸 CSS 光标 — 动态密度 (显示 = 64 × 画布缩放, 与游戏内精灵同公式); 不支持 image-set 的浏览器回退 64px
    _applyGameCursor() {
        try {
            const cv = this.game.canvas;
            const sc = cv && cv.clientWidth ? (cv.clientWidth / cv.width) : 1;
            const hot = Math.round(32 * sc);
            cv.style.cursor = 'url(assets/images/Mouse_cursor.png) 32 32, default';
            cv.style.cursor = '-webkit-image-set(url(assets/images/Mouse_cursor.png) ' + (1 / sc).toFixed(3) + 'x) ' + hot + ' ' + hot + ', default';
        } catch (e) {}
    }

    _askSkip() {
        if (this._confirmOpen || this._finishing) return;
        this._confirmOpen = true;
        const W = this.scale.width, H = this.scale.height;
        // 防御性 — 重新设置 game 鼠标 (确保弹窗里也是游戏内置鼠标; 与 create 同值, 重复设置不闪)
        this._applyGameCursor();
        // 半透明遮罩
        const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(20);
        // 弹窗
        const boxW = 480, boxH = 200;
        const box = this.add.rectangle(W / 2, H / 2, boxW, boxH, 0x1a1a1a).setDepth(21);
        box.setStrokeStyle(2, 0xffffff);
        const q = this.add.text(W / 2, H / 2 - 40, 'Skip the intro?', {
            fontSize: '28px', color: '#ffffff', fontFamily: '"VT323", monospace'
        }).setOrigin(0.5).setDepth(22);

        // 不用 useHandCursor — 防止 canvas.style.cursor 被覆盖
        const yesBtn = this.add.text(W / 2 - 70, H / 2 + 30, '[ Yes ]', {
            fontSize: '24px', color: '#ff6644', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 2
        }).setOrigin(0.5).setDepth(22).setInteractive();
        const noBtn = this.add.text(W / 2 + 70, H / 2 + 30, '[ No ]', {
            fontSize: '24px', color: '#44ff66', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 2
        }).setOrigin(0.5).setDepth(22).setInteractive();

        yesBtn.on('pointerover', () => yesBtn.setColor('#ff9988'));
        yesBtn.on('pointerout',  () => yesBtn.setColor('#ff6644'));
        noBtn.on('pointerover',  () => noBtn.setColor('#88ff99'));
        noBtn.on('pointerout',   () => noBtn.setColor('#44ff66'));

        const closeOverlay = () => {
            try { dim.destroy(); box.destroy(); q.destroy(); yesBtn.destroy(); noBtn.destroy(); } catch(e) {}
            this._confirmOpen = false;
        };
        yesBtn.on('pointerdown', (p, lx, ly, ev) => {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            closeOverlay();
            this._finishIntro(true);
        });
        noBtn.on('pointerdown', (p, lx, ly, ev) => {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            closeOverlay();
        });
    }

    _finishIntro(skipped) {
        if (this._finishing) return;
        this._finishing = true;
        // skip 选 Yes 时快速变黑, 否则正常 600ms 黑屏
        const fadeMs = skipped ? 300 : 600;
        this.cameras.main.fadeOut(fadeMs, 0, 0, 0);
        this.time.delayedCall(fadeMs + 20, () => {
            this.scene.start('TutorialScene', { tutorialId: 1 });
        });
    }
}