// ============================================================
// BootScene — 开机统一预加载
//   一次性加载全部素材 (图片/精灵图 + 程序贴图 + 音频), 之后各场景 preload 命中缓存即跳过,
//   消除"首次进每个场景"的加载停顿/黑屏. 加载完成 → OpeningScene.
//   资源清单复用 MainGameScene.preload (单一来源, 避免重复维护两份清单).
// ============================================================
class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        const W = this.scale.width, H = this.scale.height;

        // 兜底黑底 (画布本就纯黑, 这里再铺一层, 防任何缝隙)
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000).setDepth(-1);

        // 进度条
        const barW = Math.min(460, W - 100);
        const barH = 24;
        const bx = (W - barW) / 2;
        const by = H / 2;
        const frame = this.add.graphics();
        frame.lineStyle(2, 0x666666, 1).strokeRect(bx - 3, by - 3, barW + 6, barH + 6);
        const bar = this.add.graphics();
        const pctText = this.add.text(W / 2, by + barH + 26, 'Loading... 0%', {
            fontFamily: 'monospace', fontSize: '18px', color: '#cccccc'
        }).setOrigin(0.5);

        this.load.on('progress', (p) => {
            // (用户) AudioSystem 延迟加载的第二批在 Boot 转场后才跑完 — progress 还会触发,
            // 此时进度条/文字已销毁, setText 会炸 (reading 'cut'). 销毁后直接忽略.
            if (!pctText.active || !bar.active) return;
            bar.clear().fillStyle(0xffcc33, 1).fillRect(bx, by, Math.max(0, barW * p), barH);
            pctText.setText('Loading... ' + Math.round(p * 100) + '%');
        });

        // 复用 MainGameScene 的完整加载清单.
        // (其 preload 只做 this.load.* / TextureGenerator.generateAll / AudioSystem.loadAll, 无场景特有逻辑;
        //  以本场景为 this 调用, 即把所有 load 排进本场景 loader. generateAll 已幂等, 各场景再调会跳过.)
        if (typeof MainGameScene !== 'undefined' && MainGameScene.prototype && MainGameScene.prototype.preload) {
            try {
                MainGameScene.prototype.preload.call(this);
            } catch (e) {
                console.warn('[Boot] 复用 MainGameScene.preload 失败, 资源可能未全部预载:', e);
            }
        }
    }

    create() {
        // 图片已全部加载 → 进开场动画 (音频异步加载, 不阻塞). 此后所有场景资源命中缓存, 无加载黑屏.
        this.scene.start('OpeningScene');
    }
}

if (typeof window !== 'undefined') window.BootScene = BootScene;