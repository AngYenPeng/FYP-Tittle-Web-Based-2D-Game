/**
 * DeathScene — (用户) 最后一颗心碎裂后的死亡 cutscene
 * --------------------------------------------------
 * 完全参考 StartIntroScene 演示方式 (黑底 + 320×180 图放大 3x + Undertale 打字机字幕):
 *   Deathscene1.png  "You have fallen into the hands of the abyss, slowly getting consumed....."
 *   Deathscene2.png  "It's still early to give up, stay strong."
 * 第二张播完 → 缓慢黑屏 → 荧幕中央缓缓浮现大红 GAME OVER → 缓缓黑回 → TitleScene。
 * 背景全程纯黑。无 Skip 按钮 (只有两张, click/SPACE/ENTER 推进)。
 */
class DeathScene extends Phaser.Scene {
    constructor() {
        super('DeathScene');
    }

    preload() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.loadAll(this);
        this.load.image('Deathscene1', 'assets/images/Deathscene1.png');
        this.load.image('Deathscene2', 'assets/images/Deathscene2.png');
    }

    create() {
        // (用户) 最后一颗心 = 旧死亡音效 (Death_Grow / GameOver 曲) 一概不播 — 心碎+心跳已是全部听觉, 此处保持静音
        if (typeof AudioSystem !== 'undefined') { try { AudioSystem.stopBGM(); } catch (e) {} }
        const W = this.scale.width, H = this.scale.height;

        this._slides = [
            { image: 'Deathscene1', lines: ["You have fallen into the hands of the abyss, slowly getting consumed....."] },
            { image: 'Deathscene2', lines: ["It's still early to give up, stay strong."] }
        ];
        this._slideIdx = 0;
        this._lineIdx = 0;
        this._finishing = false;

        // 黑底
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000).setDepth(0);

        // 布局与 StartIntroScene 一致: 下 1/4 字幕区, 上 3/4 图片区, 图 320×180 ×3
        const SUB_H = Math.floor(H / 4);
        const IMG_AREA_H = H - SUB_H;
        const IMG_SCALE = 3;
        const imgY = IMG_AREA_H / 2;

        if (this.textures.exists('Deathscene1')) {
            this._imageGo = this.add.image(W / 2, imgY, 'Deathscene1');
            try { this._imageGo.texture.setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
            this._imageGo.setScale(IMG_SCALE).setDepth(1);
        } else {
            this._imageGo = this.add.rectangle(W / 2, imgY, 320 * IMG_SCALE, 180 * IMG_SCALE, 0x16161e).setDepth(1);
        }

        this.add.rectangle(W / 2, IMG_AREA_H + SUB_H / 2, W, SUB_H, 0x000000, 0.9).setDepth(3);
        this._subtitle = this.add.text(W / 2, IMG_AREA_H + SUB_H / 2, '', {
            fontSize: '54px', color: '#ffffff', fontFamily: '"VT323", monospace',
            align: 'center', wordWrap: { width: W - 200 }
        }).setOrigin(0.5).setDepth(5);

        this._continueHint = this.add.text(W - 30, H - 20, '[ Click / SPACE to continue ]', {
            fontSize: '16px', color: '#666666', fontFamily: '"VT323", monospace'
        }).setOrigin(1, 1).setDepth(5);

        // 局内同尺寸 CSS 光标 (与 StartIntroScene 同公式)
        try {
            const cv = this.game.canvas;
            const sc = cv && cv.clientWidth ? (cv.clientWidth / cv.width) : 1;
            const hot = Math.round(32 * sc);
            cv.style.cursor = 'url(assets/images/Mouse_cursor.png) 32 32, default';
            cv.style.cursor = '-webkit-image-set(url(assets/images/Mouse_cursor.png) ' + (1 / sc).toFixed(3) + 'x) ' + hot + ' ' + hot + ', default';
        } catch (e) {}

        const _advanceOrComplete = () => {
            if (this._finishing) return;
            if (this._typingActive) this._completeTyping();
            else this._nextLine();
        };
        this.input.on('pointerdown', _advanceOrComplete);
        this.input.keyboard.on('keydown-SPACE', _advanceOrComplete);
        this.input.keyboard.on('keydown-ENTER', _advanceOrComplete);

        this._showCurrentLine();
        this.cameras.main.fadeIn(800, 0, 0, 0);
    }

    _showCurrentLine() {
        const slide = this._slides[this._slideIdx];
        if (!slide) return;
        if (this._imageGo && this._imageGo.setTexture && this.textures.exists(slide.image)) {
            this._imageGo.setTexture(slide.image);
            try { this._imageGo.texture.setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
        }
        this._startTypewriter(slide.lines[this._lineIdx] || '');
    }

    _startTypewriter(fullText) {
        this._stopTypewriter();
        this._typingFull = fullText;
        this._typingIdx = 0;
        this._typingActive = true;
        this._subtitle.setText('');
        this._typingEvent = this.time.addEvent({
            delay: 70, loop: true,
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

    _completeTyping() {
        if (!this._typingActive) return;
        this._stopTypewriter();
        if (this._typingFull) this._subtitle.setText(this._typingFull);
        this._typingActive = false;
    }

    _stopTypewriter() {
        if (this._typingEvent) { this._typingEvent.remove(); this._typingEvent = null; }
    }

    _nextLine() {
        if (this._finishing) return;
        this._stopTypewriter();
        this._typingActive = false;
        const slide = this._slides[this._slideIdx];
        if (!slide) { this._gameOverSequence(); return; }
        if (this._lineIdx < slide.lines.length - 1) {
            this._lineIdx++;
            this._showCurrentLine();
        } else {
            this._slideIdx++;
            this._lineIdx = 0;
            if (this._slideIdx >= this._slides.length) {
                this._gameOverSequence();
                return;
            }
            this.cameras.main.fadeOut(250, 0, 0, 0);
            this.time.delayedCall(260, () => {
                this._showCurrentLine();
                this.cameras.main.fadeIn(250, 0, 0, 0);
            });
        }
    }

    /** 缓慢黑屏 → 大红 GAME OVER 缓现 → 缓隐 → TitleScene */
    _gameOverSequence() {
        if (this._finishing) return;
        this._finishing = true;
        const W = this.scale.width, H = this.scale.height;
        // ① 图片/字幕/提示 缓慢淡出 (背景本就是黑 → 等效缓慢黑屏)
        this.tweens.add({
            targets: [this._imageGo, this._subtitle, this._continueHint],
            alpha: 0, duration: 1400, ease: 'Power1',
            onComplete: () => {
                // ② 大红 GAME OVER 缓缓浮现
                const go = this.add.text(W / 2, H / 2, 'GAME OVER', {
                    fontSize: '140px', color: '#cc1111', fontFamily: '"VT323", monospace',
                    stroke: '#330000', strokeThickness: 8
                }).setOrigin(0.5).setDepth(50).setAlpha(0);
                this.tweens.add({
                    targets: go, alpha: 1, duration: 1600, ease: 'Power1',
                    onComplete: () => {
                        // ③ 停留后缓缓黑回 → Title
                        this.time.delayedCall(1500, () => {
                            this.tweens.add({
                                targets: go, alpha: 0, duration: 1400, ease: 'Power1',
                                onComplete: () => {
                                    this.time.delayedCall(350, () => this.scene.start('TitleScene'));
                                }
                            });
                        });
                    }
                });
            }
        });
    }
}