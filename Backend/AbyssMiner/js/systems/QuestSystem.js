/**
 * QuestSystem — 任务追踪 + HUD 显示
 *
 * 任务结构：
 *   { id, title, description, status, objectives, rewards }
 *   status: 'inactive' | 'active' | 'completed' | 'turned_in'
 *   objectives: [{ id, text, target, current, complete }]
 *
 * 用法：
 *   const quest = new QuestSystem(scene);
 *   quest.init();
 *
 *   // 注册任务（一般在 scene.create 里调）
 *   quest.registerQuest({
 *       id: 'find_first_journal',
 *       title: 'Lost Miners',
 *       description: 'Find evidence of the missing miners.',
 *       objectives: [
 *           { id: 'reach_npc', text: 'Find a survivor', target: 1, current: 0 },
 *           { id: 'find_journal', text: 'Find a miner\'s journal', target: 1, current: 0 }
 *       ]
 *   });
 *
 *   // 激活任务
 *   quest.activate('find_first_journal');
 *
 *   // 推进进度
 *   quest.progress('find_first_journal', 'reach_npc', 1);
 *
 *   // 查询是否完成
 *   if (quest.isComplete('find_first_journal')) { ... }
 */
class QuestSystem {
    constructor(scene) {
        this.scene = scene;
        this.quests = new Map();   // id → quest
        this.activeQuestId = null; // 当前显示在 HUD 的任务

        // HUD 显示
        this.hudPanel = null;
    }

    init() {
        this._buildHUD();
    }

    _buildHUD() {
        const s = this.scene;
        const W = s.cameras.main.width;

        // 右上角下方（避开背包/设定按钮）
        const PW = 280, PH = 130;
        const x = W - PW / 2 - 16;
        const y = 80 + PH / 2;

        this.hudPanel = s.add.container(x, y)
            .setScrollFactor(0).setDepth(200).setVisible(false);

        const bg = s.add.rectangle(0, 0, PW, PH, 0x000000, 0.65)
            .setStrokeStyle(1, 0x6688aa);

        this._titleText = s.add.text(-PW / 2 + 10, -PH / 2 + 8, '', {
            fontSize: '18px', color: '#ffcc55', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        });

        this._objectiveTexts = [];
        for (let i = 0; i < 4; i++) {
            const t = s.add.text(-PW / 2 + 12, -PH / 2 + 36 + i * 22, '', {
                fontSize: '15px', color: '#dddddd', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 2,
                wordWrap: { width: PW - 24 }
            });
            this._objectiveTexts.push(t);
            this.hudPanel.add(t);
        }

        this.hudPanel.add([bg, this._titleText]);

        // 让 mainCam ignore（只在 uiCam 渲染）
        s.time.delayedCall(50, () => {
            if (s.cameras.main) {
                try { s.cameras.main.ignore(this.hudPanel); } catch(e) {}
            }
        });
    }

    /** 注册一个任务（不激活） */
    registerQuest(def) {
        const quest = {
            id: def.id,
            title: def.title,
            description: def.description || '',
            status: 'inactive',
            objectives: (def.objectives || []).map(o => ({
                id: o.id,
                text: o.text,
                target: o.target ?? 1,
                current: o.current ?? 0,
                complete: false
            })),
            rewards: def.rewards || null,
            onComplete: def.onComplete || null,
        };
        this.quests.set(def.id, quest);
        return quest;
    }

    /** 激活任务（变成 active 状态，显示在 HUD） */
    activate(questId) {
        const q = this.quests.get(questId);
        if (!q) return;
        q.status = 'active';
        this.activeQuestId = questId;
        this._refreshHUD();
        this.hudPanel.setVisible(true);

        // 显示一个"任务接受"提示
        this._flashAcceptedToast(q.title);
    }

    /** 推进任务进度 */
    progress(questId, objectiveId, amount = 1) {
        const q = this.quests.get(questId);
        if (!q || q.status !== 'active') return;
        const obj = q.objectives.find(o => o.id === objectiveId);
        if (!obj || obj.complete) return;

        obj.current = Math.min(obj.target, obj.current + amount);
        if (obj.current >= obj.target) {
            obj.complete = true;
        }

        // 检查整个任务是否完成
        if (q.objectives.every(o => o.complete)) {
            q.status = 'completed';
            this._flashCompletedToast(q.title);
            if (typeof q.onComplete === 'function') q.onComplete();
        }

        if (questId === this.activeQuestId) this._refreshHUD();
    }

    isComplete(questId) {
        const q = this.quests.get(questId);
        return q && (q.status === 'completed' || q.status === 'turned_in');
    }

    isActive(questId) {
        const q = this.quests.get(questId);
        return q && q.status === 'active';
    }

    /** 标记任务已交付（NPC 收到） */
    turnIn(questId) {
        const q = this.quests.get(questId);
        if (!q) return;
        q.status = 'turned_in';
        if (this.activeQuestId === questId) {
            this.activeQuestId = null;
            this.hudPanel.setVisible(false);
        }
    }

    _refreshHUD() {
        if (!this.activeQuestId) {
            this.hudPanel.setVisible(false);
            return;
        }
        const q = this.quests.get(this.activeQuestId);
        if (!q) return;

        this._titleText.setText(q.title.toUpperCase());

        for (let i = 0; i < this._objectiveTexts.length; i++) {
            const obj = q.objectives[i];
            if (!obj) {
                this._objectiveTexts[i].setText('');
                continue;
            }
            const check = obj.complete ? '✓' : '◇';
            const progress = obj.target > 1 ? ` (${obj.current}/${obj.target})` : '';
            this._objectiveTexts[i]
                .setText(`${check} ${obj.text}${progress}`)
                .setColor(obj.complete ? '#88ff88' : '#dddddd');
        }
    }

    _flashAcceptedToast(title) {
        this._showToast('NEW QUEST: ' + title, '#ffcc55');
    }

    _flashCompletedToast(title) {
        this._showToast('QUEST COMPLETE: ' + title, '#88ff88');
    }

    _showToast(text, color) {
        const s = this.scene;
        const W = s.cameras.main.width;
        const t = s.add.text(W / 2, 200, text, {
            fontSize: '28px', color, fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5).setScrollFactor(0).setDepth(900).setAlpha(0);

        try { s.cameras.main.ignore(t); } catch(e) {}

        s.tweens.add({
            targets: t,
            alpha: 1,
            y: 180,
            duration: 400,
            ease: 'Power2',
            yoyo: true,
            hold: 1500,
            onComplete: () => t.destroy()
        });
    }

    getAllUIObjects() {
        return this.hudPanel ? [this.hudPanel] : [];
    }
}