/**
 * RankingSystem — 通关结局流程 (用户重做)
 *   ① 离洞 cutscene 占位 (正式 cutscene 之后替换此段)
 *   ② 文凭式结算页: 数字从 0 滚动, 评级 D→目标 逐级跳
 *   ③ 电影式片尾字幕 (下→上滚动, 右上 SKIP)
 *   ④ 缓慢黑屏 → TitleScene
 * 入口签名不变: show(crystalCount, opts) ; opts.noRecord = 预览不写 RECORDS
 */
class RankingSystem {
    constructor(scene) {
        this.scene = scene;
        this.isOpen = false;
    }

    /* 统一 UI 修饰: 固定屏幕 + 高深度 + 只让 uiCam 渲染 */
    _fix(els) {
        els.forEach(o => { try { o.setScrollFactor(0).setDepth(this._d++); } catch (e) {} });
        if (this.scene.uiCam) { try { this.scene.cameras.main.ignore(els); } catch (e) {} }
        this._all.push(...els);
        return els;
    }

    show(crystalCount, opts = {}) {
        if (this.isOpen) return;
        this.isOpen = true;
        this._d = 2000;
        this._all = [];

        const s = this.scene;
        if (s && s._freezeForEnding) s._freezeForEnding();   // (用户) 结局开播 = 局内世界总闸
        this._W = s.cameras.main.width;
        this._H = s.cameras.main.height;

        // ── 结算数据 ──────────────────────────────────────
        const deaths = (s.registry && s.registry.get('runDeaths')) || 0;
        let grade, gradeColor, comment;
        // (用户) 评级按本局死亡数: 0=S, 1-2=A, 3-4=B, 5-6=C, 7+=D
        if (deaths <= 0)      { grade = 'S'; gradeColor = '#ffcc44'; comment = 'Flawless descent!'; }
        else if (deaths <= 2) { grade = 'A'; gradeColor = '#88dd66'; comment = 'Excellent work!'; }
        else if (deaths <= 4) { grade = 'B'; gradeColor = '#66aaff'; comment = 'Solid run.'; }
        else if (deaths <= 6) { grade = 'C'; gradeColor = '#cccccc'; comment = 'Just scraped by.'; }
        else                   { grade = 'D'; gradeColor = '#aa6666'; comment = 'You barely made it out.'; }
        const timeMs = (typeof SaveSystem !== 'undefined' && SaveSystem._tickPlayMs) ? SaveSystem._tickPlayMs(s) : 0;
        const diffMode = (window.AbyssDiff ? AbyssDiff.mode : 'easy');
        this._stats = { crystals: Math.min(99999, crystalCount | 0), deaths, grade, gradeColor, comment, timeMs, diffMode };   // (用户) 水晶封顶 99999

        // (用户) 通关记录落盘; noRecord = 预览模式
        try {
            if (opts.noRecord) throw 'skip';
            const recs = JSON.parse(localStorage.getItem('abyssMinerClearRecords') || '[]');
            recs.unshift({ at: Date.now(), difficulty: diffMode, crystals: Math.min(99999, crystalCount | 0), grade, deaths, timeMs });   // (用户) 水晶封顶 99999
            if (recs.length > 30) recs.length = 30;   // 只留最近 30 场
            localStorage.setItem('abyssMinerClearRecords', JSON.stringify(recs));
            if (window.AbyssDiff && AbyssDiff.markCleared) AbyssDiff.markCleared();   // (用户) 通关旗: 解锁 Extreme + 首通时排队碎屏演出
            // (用户) 通关成就: 解锁当前难度首次通关 (clear_easy/normal/hard/extreme) + 全程无死亡 (one_life).
            //   真正通关点 = 进 z6 暗门触发本结算 (原 SpiderQueenBoss.die 已废弃不跑). unlock 对已解锁幂等 → 只首通弹 toast.
            if (typeof AchievementSystem !== 'undefined' && AchievementSystem.unlock) {
                AchievementSystem.unlock(s, 'clear_' + diffMode);
                if (deaths === 0) AchievementSystem.unlock(s, 'one_life');
            }
            // (用户) 通关: 当前存档标记 GAME CLEAR (槽位金色显示, 不可继续), 记录内容与文凭一致
            if (typeof SaveSystem !== 'undefined' && SaveSystem.getCurrentSlot) {
                const _slot = SaveSystem.getCurrentSlot();
                if (_slot != null) {
                    const _d = SaveSystem.getSlot(_slot) || SaveSystem.captureFromScene(s) || {};
                    _d.cleared = true;
                    _d.clearStats = { crystals: this._stats.crystals, grade, deaths, timeMs, difficulty: diffMode, at: Date.now() };
                    SaveSystem.saveSlot(_slot, _d);
                }
            }
        } catch (e) {}

        this._stage1LeaveCutscene();
    }

    /* ════ ① 离洞 cutscene — (用户) Ending1/2/3 三联幻灯, 完全复刻 StartIntroScene 演示方式 ════
       黑底 + 320×180 图放大 3x + Undertale 打字机字幕 + click/SPACE 推进 + SKIP. 播完 → _stage2Diploma() */
    _stage1LeaveCutscene() {
        const s = this.scene, W = this._W, H = this._H;
        // (用户) 结局旁白 — 与 intro 同声部 (第二人称短句), 坠入↔爬出首尾呼应
        this._endSlides = [
            { image: 'Ending1', lines: [
                "Your hand reaches the surface and feels the cold breeze.",
                "After the adventuring in the abyss, even the dim sky feels blinding."
            ] },
            { image: 'Ending2', lines: [
                "The city still thriving on the horizon, like nothing ever happened.",
                "At your feet, a bag of crystals... and a truth too heavy to sell.",
                "You're not the same person who climbed down."
            ] },
            { image: 'Ending3', lines: [
                "Behind you, the uncovered secrets of the mine.",
                "Only one set of footprints leads away from it — yours."
            ] }
        ];
        this._endSlideIdx = 0;
        this._endLineIdx = 0;
        this._endDone = false;

        const SUB_H = Math.floor(H / 4);
        const IMG_AREA_H = H - SUB_H;
        const imgY = IMG_AREA_H / 2;

        const black = s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setInteractive();
        let img;
        if (s.textures.exists('Ending1')) {
            img = s.add.image(W / 2, imgY, 'Ending1').setScale(3).setAlpha(0);
            try { img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
        } else {
            img = s.add.rectangle(W / 2, imgY, 960, 540, 0x16161e).setAlpha(0);
        }
        const subBar = s.add.rectangle(W / 2, IMG_AREA_H + SUB_H / 2, W, SUB_H, 0x000000, 0.9).setAlpha(0);
        const sub = s.add.text(W / 2, IMG_AREA_H + SUB_H / 2, '', {
            fontSize: '54px', color: '#ffffff', fontFamily: '"VT323", monospace',
            align: 'center', wordWrap: { width: W - 200 }
        }).setOrigin(0.5).setAlpha(0);
        const hint = s.add.text(W - 30, H - 20, '[ Click / SPACE to continue ]', {
            fontSize: '16px', color: '#666666', fontFamily: '"VT323", monospace'
        }).setOrigin(1, 1).setAlpha(0);
        const skip = this._makeSkip(() => finish());
        this._fix([black, img, subBar, sub, hint, ...skip]);
        this._endImg = img; this._endSub = sub;

        // 打字机
        const stopType = () => { if (this._endTypeEv) { this._endTypeEv.remove(); this._endTypeEv = null; } try { if (this._endTypeSnd) { this._endTypeSnd.stop(); this._endTypeSnd.destroy(); this._endTypeSnd = null; } } catch (e) {} };   // (用户) 含停打字声 (打完/跳过/切行/finish 全经过这里)
        const startType = (full) => {
            stopType();
            this._endTypeFull = full; this._endTypeIdx = 0; this._endTyping = true;
            sub.setText('');
            try { if (s.sound && s.cache.audio.exists('DialogSound')) { const vol = (typeof AudioSystem !== 'undefined') ? AudioSystem.sfxVolume : 0.6; this._endTypeSnd = s.sound.add('DialogSound', { loop: true, volume: vol }); this._endTypeSnd.play(); } } catch (e) {}   // (用户) 开始逐字 → 循环播打字声
            this._endTypeEv = s.time.addEvent({ delay: 70, loop: true, callback: () => {
                this._endTypeIdx++;
                sub.setText(this._endTypeFull.substring(0, this._endTypeIdx));
                if (this._endTypeIdx >= this._endTypeFull.length) { stopType(); this._endTyping = false; }
            }});
        };
        const showLine = () => {
            const sl = this._endSlides[this._endSlideIdx];
            if (!sl) return;
            if (img.setTexture && s.textures.exists(sl.image)) {
                img.setTexture(sl.image);
                try { img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
            }
            startType(sl.lines[this._endLineIdx] || '');
        };
        const nextLine = () => {
            if (this._endDone) return;
            stopType(); this._endTyping = false;
            const sl = this._endSlides[this._endSlideIdx];
            if (!sl) { finish(); return; }
            if (this._endLineIdx < sl.lines.length - 1) {
                this._endLineIdx++; showLine();
            } else {
                this._endSlideIdx++; this._endLineIdx = 0;
                if (this._endSlideIdx >= this._endSlides.length) { finish(); return; }
                // 短淡黑过渡 (intro 同款 250ms)
                s.tweens.add({ targets: [img, sub], alpha: 0, duration: 250, onComplete: () => {
                    showLine();
                    s.tweens.add({ targets: [img, sub], alpha: 1, duration: 250 });
                }});
            }
        };
        const advance = () => {
            if (this._endDone) return;
            if (this._endTyping) { stopType(); sub.setText(this._endTypeFull); this._endTyping = false; }
            else nextLine();
        };
        const onPointer = (pointer) => {
            const sb = skip[0];
            if (sb && sb.getBounds) {
                const b = sb.getBounds();
                if (pointer.x >= b.x && pointer.x <= b.x + b.width && pointer.y >= b.y && pointer.y <= b.y + b.height) return;
            }
            advance();
        };
        s.input.on('pointerdown', onPointer);
        const onSpace = () => advance(), onEnter = () => advance();
        s.input.keyboard.on('keydown-SPACE', onSpace);
        s.input.keyboard.on('keydown-ENTER', onEnter);
        s.events.once('shutdown', () => { try { if (this._endTypeSnd) { this._endTypeSnd.stop(); this._endTypeSnd.destroy(); this._endTypeSnd = null; } } catch (e) {} });   // (用户) 场景切走 → 停打字声兜底, 防循环音效跟到下个场景

        let done = false;
        const finish = () => {
            if (done) return; done = true; this._endDone = true;
            stopType();
            s.input.off('pointerdown', onPointer);
            s.input.keyboard.off('keydown-SPACE', onSpace);
            s.input.keyboard.off('keydown-ENTER', onEnter);
            [img, subBar, sub, hint, ...skip].forEach(o => { try { o.destroy(); } catch (e) {} });
            this._black = black;   // 黑底留给后续阶段
            this._stage2Diploma();
        };

        // 入场: 黑底盖世界 → 元素淡入 → 第一行开打
        s.tweens.add({ targets: black, fillAlpha: 1, duration: 700, onComplete: () => {
            s.tweens.add({ targets: [img, subBar, sub, hint], alpha: 1, duration: 400 });
            showLine();
        }});
    }

    /* 右上角 SKIP 按钮 (返回 [bg, txt]) */
    _makeSkip(onClick) {
        const s = this.scene, W = this._W;
        const bg = s.add.rectangle(W - 70, 36, 104, 34, 0x1c1828, 0.9).setStrokeStyle(2, 0x6a5a2a).setInteractive();
        const tx = s.add.text(W - 70, 36, 'SKIP \u25B8', {
            fontSize: '20px', color: '#9aa0b0', fontFamily: '"VT323", monospace', resolution: 2
        }).setOrigin(0.5);
        bg.on('pointerover', () => { bg.setFillStyle(0x262036, 1); tx.setColor('#ffd86a'); });
        bg.on('pointerout',  () => { bg.setFillStyle(0x1c1828, 0.9); tx.setColor('#9aa0b0'); });
        bg.on('pointerdown', onClick);
        return [bg, tx];
    }

    /* ════ ② 文凭式结算页 ════ */
    _stage2Diploma() {
        const s = this.scene, W = this._W, H = this._H;
        const st = this._stats;
        const cx = W / 2, cy = H / 2;
        const PW = 860, PH = 540;
        const els = [];

        // 证书框: 深底 + 双层金边
        els.push(s.add.rectangle(cx, cy, PW, PH, 0x0b0b12, 0.98).setStrokeStyle(3, 0x806020).setInteractive());
        els.push(s.add.rectangle(cx, cy, PW - 14, PH - 14, 0x000000, 0).setStrokeStyle(1, 0xffcc44, 0.35));
        // 四角装饰
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
            els.push(s.add.text(cx + sx * (PW / 2 - 30), cy + sy * (PH / 2 - 28), '\u25C6', {
                fontSize: '20px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2
            }).setOrigin(0.5));
        });

        els.push(s.add.text(cx, cy - PH / 2 + 44, '\u2014 CERTIFICATE OF CLEARANCE \u2014', {
            fontSize: '18px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2
        }).setOrigin(0.5));
        els.push(s.add.text(cx, cy - PH / 2 + 96, '\u2605  GAME CLEAR  \u2605', {
            fontSize: '44px', color: '#ffffff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 5, resolution: 2
        }).setOrigin(0.5));
        els.push(s.add.rectangle(cx, cy - PH / 2 + 130, 340, 3, 0xffcc44, 0.9));
        const _dc = { easy: '#88ff88', normal: '#ffee88', hard: '#ffaa66', extreme: '#ff6666' }[st.diffMode] || '#dddddd';
        els.push(s.add.text(cx, cy - PH / 2 + 162, '[ ' + String(st.diffMode).toUpperCase() + ' ]', {
            fontSize: '22px', color: _dc, fontFamily: '"VT323", monospace', resolution: 2
        }).setOrigin(0.5));

        // 左: 评级 (D → 目标 逐级跳)
        els.push(s.add.text(cx - 250, cy + 8, 'RANK', {
            fontSize: '18px', color: '#9aa0b0', fontFamily: '"VT323", monospace', resolution: 2
        }).setOrigin(0.5));
        const gradeT = s.add.text(cx - 250, cy + 92, 'D', {
            fontSize: '120px', color: '#aa6666', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 8, resolution: 2
        }).setOrigin(0.5);
        els.push(gradeT);

        // 右: 三项数据 (从 0 滚动)
        const ROWS = [
            { label: 'CRYSTALS', y: cy - 30, fmt: v => String(Math.round(v)), target: st.crystals, delay: 350, dur: 1100 },
            // (用户) 时间精确到 时:分:秒, 小时最高 99, 超过从 0 循环
            { label: 'TIME',     y: cy + 42, fmt: v => { const ms = Math.round(v); const h = Math.floor(ms / 3600000) % 100, m = Math.floor(ms / 60000) % 60, s2 = Math.floor(ms / 1000) % 60; const p = n => (n < 10 ? '0' : '') + n; return h + ':' + p(m) + ':' + p(s2); }, target: st.timeMs, delay: 550, dur: 1300 },
            { label: 'DEATHS',   y: cy + 114, fmt: v => String(Math.round(v)), target: st.deaths, delay: 750, dur: 900 }
        ];
        ROWS.forEach(r => {
            els.push(s.add.text(cx + 30, r.y, r.label, {
                fontSize: '18px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2
            }).setOrigin(0, 0.5));
            const valT = s.add.text(cx + 330, r.y, r.fmt(0), {
                fontSize: '38px', color: '#ffffff', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4, resolution: 2
            }).setOrigin(1, 0.5);
            els.push(valT);
            const counter = { v: 0 };
            s.tweens.add({ targets: counter, v: r.target, duration: r.dur, delay: r.delay, ease: 'Cubic.easeOut',
                onUpdate: () => valT.setText(r.fmt(counter.v)) });
        });

        // 评语 + CONTINUE
        els.push(s.add.text(cx, cy + PH / 2 - 96, st.comment, {
            fontSize: '20px', color: '#9aa0b0', fontFamily: '"VT323", monospace', fontStyle: 'italic', resolution: 2
        }).setOrigin(0.5).setAlpha(0));
        const contBg = s.add.rectangle(cx, cy + PH / 2 - 48, 180, 40, 0x1c1828, 1).setStrokeStyle(2, 0x806020).setInteractive();
        const contT = s.add.text(cx, cy + PH / 2 - 48, 'CONTINUE', {
            fontSize: '22px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2
        }).setOrigin(0.5);
        contBg.setAlpha(0); contT.setAlpha(0);
        els.push(contBg, contT);
        this._fix(els);

        // 评级阶梯: D → 目标
        const LADDER = ['D', 'C', 'B', 'A', 'S'];
        const COLORS = { D: '#aa6666', C: '#cccccc', B: '#66aaff', A: '#88dd66', S: '#ffcc44' };
        const ti = LADDER.indexOf(st.grade);
        for (let i = 0; i <= ti; i++) {
            s.time.delayedCall(900 + i * 240, () => {
                gradeT.setText(LADDER[i]).setColor(COLORS[LADDER[i]]);
                gradeT.setScale(1.3);
                s.tweens.add({ targets: gradeT, scale: 1, duration: 180, ease: 'Back.easeOut' });
                if (i === ti) {
                    if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(s, 'Select');
                    s.tweens.add({ targets: gradeT, scale: 1.12, duration: 240, delay: 200, yoyo: true, ease: 'Sine.easeInOut' });
                }
            });
        }
        // 评语 + CONTINUE 渐显
        s.tweens.add({ targets: els[els.length - 3], alpha: 1, duration: 500, delay: 1900 });
        s.tweens.add({ targets: [contBg, contT], alpha: 1, duration: 500, delay: 2200 });
        contBg.on('pointerover', () => { contBg.setFillStyle(0x262036, 1); contT.setColor('#ffffff'); });
        contBg.on('pointerout',  () => { contBg.setFillStyle(0x1c1828, 1); contT.setColor('#ffd86a'); });
        let used = false;
        contBg.on('pointerdown', () => {
            if (used) return; used = true;
            els.forEach(o => { try { o.destroy(); } catch (e) {} });
            this._stage3Credits();
        });
    }

    /* ════ ③ 电影式片尾字幕 ════ */
    _stage3Credits() {
        const s = this.scene, W = this._W, H = this._H;
        if (this._black) this._black.fillAlpha = 1;

        const cont = s.add.container(W / 2, 0);
        const add = (y, text, style) => {
            const t = s.add.text(0, y, text, Object.assign({ fontFamily: '"VT323", monospace', resolution: 2 }, style)).setOrigin(0.5);
            cont.add(t);
            return t;
        };
        let y = 0;
        add(y, 'ABYSS MINER', { fontSize: '52px', color: '#88ccff', stroke: '#1a3550', strokeThickness: 6, letterSpacing: 6 }); y += 52;
        add(y, 'A Roguelike Mining Adventure', { fontSize: '20px', color: '#9aa6b5' }); y += 110;
        const crew = [
            { role: 'PROGRAMMING',        name: 'Ang Yen Peng' },
            { role: 'BACKEND & DATABASE', name: 'Low Yong Yi' },
            { role: 'ART & LEVEL DESIGN', name: 'Dylan' }
        ];
        crew.forEach(c => {
            add(y, c.role, { fontSize: '18px', color: '#ffd86a', letterSpacing: 3 }); y += 34;
            add(y, c.name, { fontSize: '34px', color: '#ffffff', stroke: '#000', strokeThickness: 4 }); y += 92;
        });
        add(y, 'MADE WITH', { fontSize: '18px', color: '#ffd86a', letterSpacing: 3 }); y += 34;
        add(y, 'Phaser 3', { fontSize: '30px', color: '#ffffff', stroke: '#000', strokeThickness: 4 }); y += 92;
        add(y, 'SPECIAL THANKS', { fontSize: '18px', color: '#ffd86a', letterSpacing: 3 }); y += 34;
        add(y, 'You \u2014 for playing', { fontSize: '30px', color: '#ffffff', stroke: '#000', strokeThickness: 4 }); y += 130;
        add(y, '\u2605  THANK YOU FOR PLAYING  \u2605', { fontSize: '34px', color: '#ffd86a', stroke: '#000', strokeThickness: 5 });
        const totalH = y + 60;

        const skip = this._makeSkip(() => end());
        this._fix([cont, ...skip]);

        cont.y = H + 40;
        const SPEED = 42;   // px/s
        s.tweens.add({
            targets: cont, y: -(totalH + 40),
            duration: ((H + totalH + 80) / SPEED) * 1000,
            ease: 'Linear',
            onComplete: () => end()
        });

        let ended = false;
        const end = () => {
            if (ended) return; ended = true;
            // ④ 缓慢黑屏 → 回主页
            const fade = s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setInteractive();
            this._fix([fade]);
            s.tweens.add({ targets: fade, fillAlpha: 1, duration: 1400, onComplete: () => {
                try { s.scene.start('TitleScene'); } catch (e) {}
            } });
        };
    }
}