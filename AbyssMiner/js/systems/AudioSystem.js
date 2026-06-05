// ============================================================
// AudioSystem — BGM + 音效管理 (全静态 API, 任何场景直接调用)
//   用法: AudioSystem.sfx(this, 'CrystalBreak');  AudioSystem.bgm(this, 'bgm_SafeZone1');
//   音频文件放在 audio/<分类>/<名字>.mp3, 缺失时静默 (不报错)
// ============================================================
class AudioSystem {

    // 加载全部音频 (在各场景 preload 调用; 已加载的 key 自动跳过)
    static loadAll(scene) {
        AudioSystem.applyUserSettings();   // 读取并应用用户音量/震动设置
        // 音频延迟到首屏(图片)加载完成后再异步加载, 不阻塞首屏渲染 (消除进场白屏 / 404 音频拖慢加载)
        scene.load.once('complete', () => {
            const m = AudioSystem.MANIFEST;
            let queued = 0;
            for (const key in m) {
                try {
                    if (scene.cache.audio.exists(key)) continue;
                    scene.load.audio(key, 'assets/audio/' + m[key]);
                    queued++;
                } catch (e) {}
            }
            if (queued > 0) {
                // 缺失/改名的音频 → 静默处理: 加载器不刷屏, 播放端已用 cache.audio.exists 兜底.
                // (浏览器自身的网络 404 行 JS 无法屏蔽, 但这里按 key 汇总, 方便对照 assets/audio/ 下的真实文件名)
                const missingAudio = [];
                const onAudioErr = (file) => { if (file && file.type === 'audio') missingAudio.push(file.key); };
                scene.load.on('loaderror', onAudioErr);
                scene.load.once('complete', () => {
                    try { scene.load.off('loaderror', onAudioErr); } catch (e) {}
                    if (missingAudio.length) {
                        try { console.debug('[AudioSystem] 这些音频没加载到 (播放时会静默跳过, 检查 assets/audio/ 下文件名):', missingAudio.join(', ')); } catch (e) {}
                    }
                    // (用户) 刷新后 BGM 在音频加载完成前就被请求过 → 当时 cache 没有该 key 被静默丢弃.
                    // 这里补播: 加载一完成立刻重试 (浏览器解锁前会挂在 'unlocked' 上, 任意一次点击/按键即响)
                    if (AudioSystem._bgmKey && !(AudioSystem._bgm && AudioSystem._bgm.isPlaying)) {
                        const sc = (scene.sys && scene.sys.isActive && scene.sys.isActive()) ? scene
                                 : (scene.game && scene.game.scene.getScenes(true)[0]);
                        if (sc) { try { AudioSystem.bgm(sc, AudioSystem._bgmKey); } catch (e) {} }
                    }
                });
                try { scene.load.start(); } catch (e) {}
            }
        });
    }

    // 播放一次性音效. opts 可含 { volume, rate, detune } 等 Phaser sound config
    static sfx(scene, key, opts) {
        if (!scene || !scene.sound) return null;
        try {
            if (!scene.cache.audio.exists(key)) return null;  // 文件缺失 → 静默
            const cfg = Object.assign({ volume: AudioSystem.sfxVolume }, opts || {});
            return scene.sound.play(key, cfg);
        } catch (e) { return null; }
    }

    // 随机播放一组音效里的一个 (例如 Golem 的 Smash / Smash2)
    static sfxRandom(scene, keys, opts) {
        if (!Array.isArray(keys) || !keys.length) return null;
        const k = keys[Math.floor(Math.random() * keys.length)];
        return AudioSystem.sfx(scene, k, opts);
    }

    // 播放循环 BGM (全局单例, 切场景自动停旧的). 同一首在播则不重启
    static bgm(scene, key, opts) {
        if (AudioSystem._bgmKey === key && AudioSystem._bgm && AudioSystem._bgm.isPlaying) return;
        AudioSystem.stopBGM();
        AudioSystem._bgmKey = key || null;
        if (!scene || !scene.sound || !key) return;
        try {
            if (!scene.cache.audio.exists(key)) return;  // 缺失 → 记 key 但不播
            const vol = (opts && opts.volume != null) ? opts.volume : AudioSystem.bgmVolume;
            const b = scene.sound.add(key, { loop: true, volume: vol });
            AudioSystem._bgm = b;
            if (scene.sound.locked) {
                // 浏览器自动播放锁定: 等首次点击/按键解锁后再播 (否则标题 BGM 不响)
                scene.sound.once('unlocked', () => { if (AudioSystem._bgm === b) { try { b.play(); } catch (e) {} } });
            } else {
                b.play();
            }
        } catch (e) {}
    }

    // 停止当前 BGM (跨场景, this.sound 是全局 SoundManager)
    static stopBGM() {
        if (AudioSystem._bgm) {
            try { AudioSystem._bgm.stop(); AudioSystem._bgm.destroy(); } catch (e) {}
        }
        AudioSystem._bgm = null;
        AudioSystem._bgmKey = null;
    }

    static setSfxVolume(v) { AudioSystem.sfxVolume = Math.max(0, Math.min(1, v)); }
    static setBgmVolume(v) {
        AudioSystem.bgmVolume = Math.max(0, Math.min(1, v));
        if (AudioSystem._bgm) { try { AudioSystem._bgm.setVolume(AudioSystem.bgmVolume); } catch (e) {} }
    }

    // 读取用户设置 (音量 + 震动) 并应用到全局
    static applyUserSettings() {
        let st = {};
        try { st = JSON.parse(localStorage.getItem('abyssMinerSettings') || '{}'); } catch (e) {}
        // 音量: 设置里 0-100 → AudioSystem 0-1 (BGM 稍压低, 不盖过音效)
        if (typeof st.musicVol === 'number') AudioSystem.bgmVolume = Math.max(0, Math.min(1, st.musicVol / 100 * 0.7));
        if (typeof st.sfxVol === 'number')   AudioSystem.sfxVolume = Math.max(0, Math.min(1, st.sfxVol / 100));
        // 全局设置对象 (震动等给别处读)
        if (typeof window !== 'undefined') {
            window._abyssSettings = window._abyssSettings || {};
            window._abyssSettings.shake      = (st.shake !== false);                    // 默认开
            window._abyssSettings.musicVol   = (st.musicVol   != null ? st.musicVol   : 80);
            window._abyssSettings.sfxVol     = (st.sfxVol     != null ? st.sfxVol     : 80);
            window._abyssSettings.brightness = (st.brightness != null ? st.brightness : 100);
        }
        AudioSystem._patchShake();
    }

    // 给相机震动打补丁: 震动关闭时幅度归零 (保留时长/回调, 不破坏游戏逻辑). 只打一次
    static _patchShake() {
        if (AudioSystem._shakePatched) return;
        try {
            if (typeof Phaser === 'undefined') return;
            const E = Phaser.Cameras && Phaser.Cameras.Scene2D && Phaser.Cameras.Scene2D.Effects;
            const ShakeProto = E && E.Shake && E.Shake.prototype;
            if (!ShakeProto || !ShakeProto.start) return;
            const origStart = ShakeProto.start;
            ShakeProto.start = function (duration, intensity, force, callback, context) {
                if (typeof window !== 'undefined' && window._abyssSettings && window._abyssSettings.shake === false) {
                    intensity = 0;   // 震动关 → 幅度 0
                }
                return origStart.call(this, duration, intensity, force, callback, context);
            };
            AudioSystem._shakePatched = true;
        } catch (e) {}
    }
}

// ---- 静态状态 (类外赋值, 兼容性最好) ----
AudioSystem.sfxVolume = 0.6;
AudioSystem.bgmVolume = 0.35;
AudioSystem._bgm = null;
AudioSystem._bgmKey = null;
AudioSystem._shakePatched = false;

// ---- 音频清单: key → audio/ 下的相对路径 ----
AudioSystem.MANIFEST = {
    // BGM (key 加 bgm_ 前缀避免与音效冲突)
    'bgm_BatBossFight':   'BGM/BatBossFight.mp3',
    'bgm_GolemBossFight': 'BGM/GolemBossFight.mp3',
    'bgm_SafeZone1':      'BGM/SafeZone1.mp3',
    'bgm_SafeZone2':      'BGM/SafeZone2.mp3',
    'bgm_TitleScene':     'BGM/TittleScene.mp3',
    'bgm_Tutorial':       'BGM/Tutorial.mp3',
    // (用户) 各场景 BGM — 把同名 mp3 放进 assets/audio/BGM/ 即自动生效, 缺失时静默
    // (用户) 以下 BGM 素材缺失 — 暂时摘出清单 (404 会在每个场景的延迟加载里反复刷 console).
    // 音频文件放进 assets/audio/BGM/ 后把对应行解开即可, 播放端无需改动:
    // 'bgm_Hub':            'BGM/Hub.mp3',
    // 'bgm_Cave':           'BGM/Cave.mp3',
    // 'bgm_SafeZone3':      'BGM/SafeZone3.mp3',
    // 'bgm_SafeZone4':      'BGM/SafeZone4.mp3',
    // 'bgm_SafeZone5':      'BGM/SafeZone5.mp3',
    // 'bgm_SafeZone25':     'BGM/SafeZone25.mp3',
    // Golem
    // 'Golem Death':  'Golem/Golem Death.wav',   // (用户) 素材缺失暂摘, 补文件后解开
    'GolemWakeUp':  'Golem/GolemWakeUp.wav',
    'ReadySmash':   'Golem/ReadySmash.wav',
    'ReadySwipe':   'Golem/ReadySwipe.wav',
    'Smash':        'Golem/Smash.wav',
    'Smash2':       'Golem/Smash2.wav',
    'Swipe':        'Golem/Swipe.wav',
    'Swipe2':       'Golem/Swipe2.wav',
    // Mobs
    'BatDeath':     'Mobs/BatDeath.wav',
    'BatHurt':      'Mobs/BatHurt.wav',
    'SlimeDeath':   'Mobs/SlimeDeath.wav',
    'SlimeHurt':    'Mobs/SlimeHurt.wav',
    'SpiderDeath':  'Mobs/SpiderDeath.wav',
    'SpiderHurt':   'Mobs/SpiderHurt.wav',
    // NPC
    'MoleDig':      'NPC/MoleDig.wav',
    // Object
    'CheckpointActivation': 'Object/CheckpointActivation.wav',
    'ChestOpen':            'Object/ChestOpen.wav',
    'CrystalBreak':         'Object/CrystalBreak.wav',
    'CrystalDoorOpen':      'Object/CrystalDoorOpen.wav',
    'StoneDoorBreak':       'Object/StoneDoorBreak.wav',
    'UnlockWoodenDoor':     'Object/UnlockWoodenDoor.wav',
    'WoodenDoorOpen':       'Object/WoodenDoorOpen.wav',
    // UI
    'Select':       'UI/Select.wav',
    // Miner
    'CrouchWalking':    'Miner/CrouchWalking.wav',
    'JumpLanding':      'Miner/JumpLanding.wav',
    'JumpUp':           'Miner/JumpUp.wav',
    'MinerHurt':        'Miner/MinerHurt.wav',
    'PickaxeHitAir':    'Miner/PickaxeHitAir.wav',
    'PickaxeHitThings': 'Miner/PickaxeHitThings.wav',
    'Walking':          'Miner/Walking.wav',
};

if (typeof window !== 'undefined') window.AudioSystem = AudioSystem;