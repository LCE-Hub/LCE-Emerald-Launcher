import { OptionsFile } from "../types/options";
export class OptionsService {
  public static readOptions(
    buffer: ArrayBuffer,
    endianness: "little" | "big" = "little",
  ): OptionsFile {
    const rawData = new Uint8Array(buffer).slice();
    const view = new DataView(buffer);
    const little = endianness === "little";
    const opt: Partial<OptionsFile> = {
      endianness,
      rawData,
    };
    //neo: someone save me from these values
    opt.musicVolume = view.getUint8(0x01);
    opt.soundVolume = view.getUint8(0x02);
    opt.gameSensitivity = view.getUint8(0x03);
    opt.gamma = view.getUint8(0x04);
    opt.interfaceSensitivity = view.getUint8(0x50);
    opt.interfaceOpacity = view.getUint8(0x51);
    const val06 = view.getUint16(0x06, little);
    opt.difficulty = val06 & 0x3;
    opt.viewBobbing = (val06 & (1 << 2)) !== 0;
    opt.inGameGamertags = (val06 & (1 << 3)) !== 0;
    opt.invertLook = (val06 & (1 << 6)) !== 0;
    opt.southpaw = (val06 & (1 << 7)) !== 0;
    opt.verticalSplitscreen = (val06 & (1 << 8)) !== 0;
    opt.splitscreenGamertags = (val06 & (1 << 9)) !== 0;
    opt.hints = (val06 & (1 << 10)) !== 0;
    opt.autosaveTimer = (val06 >> 11) & 0xf;
    opt.inGameTooltips = (val06 & (1 << 15)) !== 0;
    const val54 = view.getUint32(0x54, little);
    opt.renderClouds = (val54 & (1 << 0)) !== 0;
    opt.displayHud = (val54 & (1 << 7)) !== 0;
    opt.displayHand = (val54 & (1 << 8)) !== 0;
    opt.customSkinAnimation = (val54 & (1 << 9)) !== 0;
    opt.deathMessages = (val54 & (1 << 10)) !== 0;
    opt.hudSize = (val54 >> 11) & 0x3;
    opt.hudSizeSplitscreen = (val54 >> 13) & 0x3;
    opt.animatedCharacter = (val54 & (1 << 15)) !== 0;
    opt.classicCrafting = (val54 & (1 << 18)) !== 0;
    opt.caveSounds = (val54 & (1 << 19)) !== 0;
    opt.gameChat = (val54 & (1 << 20)) !== 0;
    opt.minecartSounds = (val54 & (1 << 21)) !== 0;
    opt.showGlideGhost = (val54 & (1 << 22)) !== 0;
    opt.autoJump = (val54 & (1 << 26)) !== 0;
    opt.displayGameMessages = (val54 & (1 << 28)) !== 0;
    opt.displaySaveIcon = (val54 & (1 << 29)) !== 0;
    opt.flyingViewRolling = (val54 & (1 << 30)) === 0;
    opt.showGlideGhostPath = (val54 & (1 << 31)) !== 0;
    opt.chosenSkin = view.getUint32(0x4c, little);
    opt.playerCape = view.getUint32(0x5c, little);
    opt.favoriteSkins = [];
    for (let i = 0; i < 10; i++) {
      opt.favoriteSkins.push(view.getUint32(0x60 + i * 4, little));
    }

    opt.actions = {
      jump: view.getUint8(0xa4),
      use: view.getUint8(0xa5),
      action: view.getUint8(0xa6),
      cycleHeldItemLeft: view.getUint8(0xa7),
      cycleHeldItemRight: view.getUint8(0xa8),
      inventory: view.getUint8(0xa9),
      drop: view.getUint8(0xaa),
      sneakDismount: view.getUint8(0xab),
      crafting: view.getUint8(0xac),
      changeCameraMode: view.getUint8(0xad),
      flyLeft: view.getUint8(0xae),
      flyRight: view.getUint8(0xaf),
      flyUp: view.getUint8(0xb0),
      flyDown: view.getUint8(0xb1),
      sprint: view.getUint8(0xb2),
      pickBlock: view.getUint8(0xb3),
      previousPlayer: view.getUint8(0xb4),
      nextPlayer: view.getUint8(0xb5),
      spectateNoise: view.getUint8(0xb6),
      cancelSpectating: view.getUint8(0xb7),
      confirmReady: view.getUint8(0xb8),
      vote: view.getUint8(0xb9),
      restartSection: view.getUint8(0xba),
      restartRace: view.getUint8(0xbb),
      lookBehind: view.getUint8(0xbc),
    };

    return opt as OptionsFile;
  }

  public static serializeOptions(opt: OptionsFile): ArrayBuffer {
    const minSize = 0xbc + 1;
    const buffer = new Uint8Array(Math.max(opt.rawData.length, minSize));
    buffer.set(opt.rawData);
    const view = new DataView(buffer.buffer);
    const little = opt.endianness === "little";
    view.setUint8(0x01, opt.musicVolume);
    view.setUint8(0x02, opt.soundVolume);
    view.setUint8(0x03, opt.gameSensitivity);
    view.setUint8(0x04, opt.gamma);
    view.setUint8(0x50, opt.interfaceSensitivity);
    view.setUint8(0x51, opt.interfaceOpacity);
    let val06 = view.getUint16(0x06, little);
    val06 = (val06 & ~0x3) | (opt.difficulty & 0x3);
    val06 = (val06 & ~(1 << 2)) | (opt.viewBobbing ? 1 << 2 : 0);
    val06 = (val06 & ~(1 << 3)) | (opt.inGameGamertags ? 1 << 3 : 0);
    val06 = (val06 & ~(1 << 6)) | (opt.invertLook ? 1 << 6 : 0);
    val06 = (val06 & ~(1 << 7)) | (opt.southpaw ? 1 << 7 : 0);
    val06 = (val06 & ~(1 << 8)) | (opt.verticalSplitscreen ? 1 << 8 : 0);
    val06 = (val06 & ~(1 << 9)) | (opt.splitscreenGamertags ? 1 << 9 : 0);
    val06 = (val06 & ~(1 << 10)) | (opt.hints ? 1 << 10 : 0);
    val06 = (val06 & ~(0xf << 11)) | ((opt.autosaveTimer & 0xf) << 11);
    val06 = (val06 & ~(1 << 15)) | (opt.inGameTooltips ? 1 << 15 : 0);
    view.setUint16(0x06, val06, little);
    let val54 = view.getUint32(0x54, little);
    val54 = (val54 & ~(1 << 0)) | (opt.renderClouds ? 1 << 0 : 0);
    val54 = (val54 & ~(1 << 7)) | (opt.displayHud ? 1 << 7 : 0);
    val54 = (val54 & ~(1 << 8)) | (opt.displayHand ? 1 << 8 : 0);
    val54 = (val54 & ~(1 << 9)) | (opt.customSkinAnimation ? 1 << 9 : 0);
    val54 = (val54 & ~(1 << 10)) | (opt.deathMessages ? 1 << 10 : 0);
    val54 = (val54 & ~(0x3 << 11)) | ((opt.hudSize & 0x3) << 11);
    val54 = (val54 & ~(0x3 << 13)) | ((opt.hudSizeSplitscreen & 0x3) << 13);
    val54 = (val54 & ~(1 << 15)) | (opt.animatedCharacter ? 1 << 15 : 0);
    val54 = (val54 & ~(1 << 18)) | (opt.classicCrafting ? 1 << 18 : 0);
    val54 = (val54 & ~(1 << 19)) | (opt.caveSounds ? 1 << 19 : 0);
    val54 = (val54 & ~(1 << 20)) | (opt.gameChat ? 1 << 20 : 0);
    val54 = (val54 & ~(1 << 21)) | (opt.minecartSounds ? 1 << 21 : 0);
    val54 = (val54 & ~(1 << 22)) | (opt.showGlideGhost ? 1 << 22 : 0);
    val54 = (val54 & ~(1 << 26)) | (opt.autoJump ? 1 << 26 : 0);
    val54 = (val54 & ~(1 << 28)) | (opt.displayGameMessages ? 1 << 28 : 0);
    val54 = (val54 & ~(1 << 29)) | (opt.displaySaveIcon ? 1 << 29 : 0);
    val54 = (val54 & ~(1 << 30)) | (!opt.flyingViewRolling ? 1 << 30 : 0);
    val54 = (val54 & ~(1 << 31)) | (opt.showGlideGhostPath ? 1 << 31 : 0);
    view.setUint32(0x54, val54, little);
    view.setUint32(0x4c, opt.chosenSkin, little);
    view.setUint32(0x5c, opt.playerCape, little);
    for (let i = 0; i < 10; i++) {
      if (opt.favoriteSkins[i] !== undefined) {
        view.setUint32(0x60 + i * 4, opt.favoriteSkins[i], little);
      }
    }

    view.setUint8(0xa4, opt.actions.jump);
    view.setUint8(0xa5, opt.actions.use);
    view.setUint8(0xa6, opt.actions.action);
    view.setUint8(0xa7, opt.actions.cycleHeldItemLeft);
    view.setUint8(0xa8, opt.actions.cycleHeldItemRight);
    view.setUint8(0xa9, opt.actions.inventory);
    view.setUint8(0xaa, opt.actions.drop);
    view.setUint8(0xab, opt.actions.sneakDismount);
    view.setUint8(0xac, opt.actions.crafting);
    view.setUint8(0xad, opt.actions.changeCameraMode);
    view.setUint8(0xae, opt.actions.flyLeft);
    view.setUint8(0xaf, opt.actions.flyRight);
    view.setUint8(0xb0, opt.actions.flyUp);
    view.setUint8(0xb1, opt.actions.flyDown);
    view.setUint8(0xb2, opt.actions.sprint);
    view.setUint8(0xb3, opt.actions.pickBlock);
    view.setUint8(0xb4, opt.actions.previousPlayer);
    view.setUint8(0xb5, opt.actions.nextPlayer);
    view.setUint8(0xb6, opt.actions.spectateNoise);
    view.setUint8(0xb7, opt.actions.cancelSpectating);
    view.setUint8(0xb8, opt.actions.confirmReady);
    view.setUint8(0xb9, opt.actions.vote);
    view.setUint8(0xba, opt.actions.restartSection);
    view.setUint8(0xbb, opt.actions.restartRace);
    view.setUint8(0xbc, opt.actions.lookBehind);
    return buffer.buffer;
  }
}
