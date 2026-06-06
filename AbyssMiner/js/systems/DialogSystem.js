/**
 * DialogSystem — NPC 对话系统
 *
 * 用法：
 *   const dialog = new DialogSystem(scene);
 *   dialog.init();
 *
 *   // 简单对话（一段话）
 *   dialog.show({
 *       speaker: 'Whisker',
 *       text: 'Hello there.'
 *   });
 *
 *   // 多段对话（依次播放）
 *   dialog.showSequence([
 *       { speaker: 'Whisker', text: 'Another one fell down?' },
 *       { speaker: 'Whisker', text: 'You don\'t smell like the others.' }
 *   ]);
 *
 *   // 带选项的对话
 *   dialog.show({
 *       speaker: 'Whisker',
 *       text: 'What do you want?',
 *       choices: [
 *           { label: 'Show me your wares', action: () => scene.shopSystem.open() },
 *           { label: 'Tell me about this place', action: () => dialog.showSequence([...]) },
 *           { label: 'Leave', action: () => dialog.close() }
 *       ]
 *   });
 *
 * 操作：
 *   - 鼠标点击对话框 → 推进对话
 *   - 按 SPACE 键 → 推进对话
 *   - 选项用鼠标点击
 */
class DialogSystem {
    constructor(scene) {
        this.scene = scene;
        this.isOpen = false;
        this.panel = null;
        this._currentSequence = null;
        this._sequenceIdx = 0;
    }

    init() {
        this._buildPanel();
    }

    _buildPanel() {
        const s = this.scene;
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;
        const PW = W - 80, PH = 260;  // 高度 180 → 260

        this.panel = s.add.container(W / 2, H - 150)
            .setScrollFactor(0).setDepth(940).setVisible(false);

        // 背景
        const bg = s.add.rectangle(0, 0, PW, PH, 0x0a0a18, 0.95)
            .setStrokeStyle(2, 0x6688aa);
        // 说话人名牌（更大）
        this._speakerBg = s.add.rectangle(-PW / 2 + 110, -PH / 2 - 24, 220, 48, 0x1a1a2e, 1)   // (用户) 名字框上移 2px
            .setStrokeStyle(2, 0x6688aa);
        this._speakerText = s.add.text(-PW / 2 + 110, -PH / 2 - 24, '', {   // (用户) 随名字框上移 2px
            fontSize: '36px', color: '#ffcc55', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4,
            resolution: 2
        }).setOrigin(0.5);

        // 正文（字体放大一倍 + 更高分辨率）
        this._bodyText = s.add.text(-PW / 2 + 24, -PH / 2 + 28, '', {
            fontSize: '40px', color: '#ffffff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4,
            resolution: 2,
            wordWrap: { width: PW - 48 }
        });

        // 提示按 SPACE 继续（字也大一倍）
        this._hintText = s.add.text(PW / 2 - 16, PH / 2 - 16, '▼ SPACE / Click', {
            fontSize: '26px', color: '#888888', fontFamily: '"VT323", monospace',
            resolution: 2
        }).setOrigin(1, 1);

        // 选项区（动态创建，先空）
        this._choiceTexts = [];

        this.panel.add([bg, this._speakerBg, this._speakerText, this._bodyText, this._hintText]);

        // 让 mainCam ignore（只在 uiCam 渲染，不被 fog 盖）
        s.time.delayedCall(50, () => {
            if (s.cameras.main) {
                try { s.cameras.main.ignore(this.panel); } catch(e) {}
            }
        });

        // 监听 SPACE 键
        this._keySpace = s.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    /** 显示一段对话（带打字机效果） */
    show(entry) {
        if (!this.panel) return;
        this.isOpen = true;
        this.panel.setVisible(true);

        const W = this.scene.cameras.main.width;
        const PW = W - 80;
        const hasChoices = entry.choices && entry.choices.length > 0;

        // 正文 wordWrap 根据是否有选项调整
        if (hasChoices) {
            // 左 2/3 给正文，右 1/3 给选项
            this._bodyText.setStyle({ wordWrap: { width: (PW * 2 / 3) - 32 } });
            // 显示分割线
            if (!this._divider) {
                this._divider = this.scene.add.rectangle(
                    PW * 2 / 3 - PW / 2,  // x = 2/3 PW 处
                    0,
                    2, 200,  // 2px 宽，高 200 留 margin
                    0x6688aa, 0.6
                );
                this.panel.add(this._divider);
            }
            this._divider.setVisible(true);
        } else {
            this._bodyText.setStyle({ wordWrap: { width: PW - 48 } });
            if (this._divider) this._divider.setVisible(false);
        }

        this._speakerText.setText(entry.speaker || '???');
        // 打字机：先清空，逐字添加
        this._fullText = entry.text || '';
        this._typedIdx = 0;
        this._typing = true;
        this._bodyText.setText('');

        // 启动打字机定时器
        if (this._typeTimer) {
            this._typeTimer.remove(false);
            this._typeTimer = null;
        }
        if (this._fullText.length > 0) {
            this._typeTimer = this.scene.time.addEvent({
                delay: 35,
                repeat: this._fullText.length - 1,
                callback: () => {
                    this._typedIdx++;
                    if (this._bodyText) {
                        this._bodyText.setText(this._fullText.substring(0, this._typedIdx));
                    }
                    if (this._typedIdx >= this._fullText.length) {
                        this._typing = false;
                        this._typeTimer = null;
                    }
                }
            });
        } else {
            this._typing = false;
        }

        // 清旧选项
        this._choiceTexts.forEach(t => t.destroy());
        this._choiceTexts = [];

        if (entry.choices && entry.choices.length > 0) {
            this._currentChoices = entry.choices;
            this._hintText.setVisible(false);
            // 等字打完才显示选项（在 update 检测）
        } else {
            this._currentChoices = null;
            this._hintText.setVisible(true);
            this._currentEntry = entry;
        }

        // 装鼠标点击推进监听（避免重复装）
        if (!this._clickListener) {
            this._clickListener = (pointer) => {
                if (!this.isOpen) return;
                // 选项点击有自己的 listener
                if (this._choiceTexts.length > 0) return;
                this.advance();
            };
            this.scene.input.on('pointerdown', this._clickListener);
        }

        this.scene._dialogActive = true;

        // entry.onShow callback — 这条 entry 开始显示时立刻触发（用于 cinematic 同步）
        if (typeof entry.onShow === 'function') {
            try { entry.onShow(); } catch(e) { console.error('DialogSystem onShow error:', e); }
        }
    }

    /** 显示一组连续对话（按顺序播放） */
    showSequence(seq, onComplete) {
        this._currentSequence = seq;
        this._sequenceIdx = 0;
        this._sequenceCompleteCb = onComplete;
        this._showNextInSequence();
    }

    _showNextInSequence() {
        if (!this._currentSequence || this._sequenceIdx >= this._currentSequence.length) {
            // 序列完成
            const cb = this._sequenceCompleteCb;
            this._currentSequence = null;
            this._sequenceCompleteCb = null;
            this.close();
            if (cb) cb();
            return;
        }
        this.show(this._currentSequence[this._sequenceIdx]);
        this._sequenceIdx++;
    }

    _buildChoices(choices) {
        const s = this.scene;
        const W = s.cameras.main.width;
        const PW = W - 80;
        const PH = 260;
        // 分割线在 panel 内 x = PW × 2/3 - PW/2 = PW/6
        // 选项左缘 = 分割线 + 24（和正文一样的 padding）
        const dividerX = PW / 6;
        const optionLeftX = dividerX + 24;
        // 顶部 y = -PH/2 + 28（和正文同对齐）
        const optionTopY = -PH / 2 + 28;
        choices.forEach((c, i) => {
            const txt = s.add.text(optionLeftX, optionTopY + i * 50, '> ' + c.label, {
                fontSize: '28px', color: '#ffff66', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4,
                resolution: 2,
                wordWrap: { width: (PW / 3) - 48 }
            }).setOrigin(0, 0).setInteractive();  // 左上角对齐
            txt.on('pointerover', () => txt.setColor('#ffffff'));
            txt.on('pointerout',  () => txt.setColor('#ffff66'));
            txt.on('pointerdown', (ptr) => {
                if (ptr.button !== 0) return;
                if (typeof c.action === 'function') c.action();
            });
            this.panel.add(txt);
            this._choiceTexts.push(txt);
            try { s.cameras.main.ignore(txt); } catch(e) {}
        });
        this._hintText.setVisible(false);
    }

    /** 推进对话（点击或 SPACE 触发） */
    advance() {
        if (!this.isOpen) return;
        // 1. 字未显示完 → 立刻显示全部
        if (this._typing) {
            if (this._typeTimer) {
                this._typeTimer.remove(false);
                this._typeTimer = null;
            }
            this._typing = false;
            this._typedIdx = this._fullText.length;
            if (this._bodyText) this._bodyText.setText(this._fullText);
            // 显示选项（如果当前 entry 有 choices）
            if (this._currentChoices && this._choiceTexts.length === 0) {
                this._buildChoices(this._currentChoices);
            }
            return;
        }
        // 2. 字已显示完
        // 有选项 → 不能推进
        if (this._choiceTexts.length > 0) return;
        // 当前 entry 有 choices 但还没建（理论上 _typing=false 后已建，保险起见）
        if (this._currentChoices && this._choiceTexts.length === 0) {
            this._buildChoices(this._currentChoices);
            return;
        }
        // 推进到下一句
        if (this._currentSequence) {
            this._showNextInSequence();
        } else {
            this.close();
        }
    }

    close() {
        this.isOpen = false;
        this.panel.setVisible(false);
        this._choiceTexts.forEach(t => t.destroy());
        this._choiceTexts = [];
        this._currentEntry = null;
        this._currentChoices = null;
        this._typing = false;
        if (this._typeTimer) {
            this._typeTimer.remove(false);
            this._typeTimer = null;
        }
        if (this._clickListener) {
            this.scene.input.off('pointerdown', this._clickListener);
            this._clickListener = null;
        }
        this.scene._dialogActive = false;
    }

    update() {
        if (!this.isOpen) return;
        // 字打完了且有 choices 待建 → 自动建
        if (!this._typing && this._currentChoices && this._choiceTexts.length === 0) {
            this._buildChoices(this._currentChoices);
        }
        if (this._keySpace && Phaser.Input.Keyboard.JustDown(this._keySpace)) {
            this.advance();
        }
    }

    /** 供 uiCam.ignore() 使用 */
    getAllUIObjects() {
        return this.panel ? [this.panel] : [];
    }
}