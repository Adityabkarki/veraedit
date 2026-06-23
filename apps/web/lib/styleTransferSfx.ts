/**

 * SFX preview — plays real bundled MP3s from the SFX library.

 */



import { playSfx } from '@/lib/sfxLibrary'



/** Play a short preview for an SFX slot type. */

export function playStyleTransferSfx(

  sfxType: string,

  volume = 0.35,

  toolId?: string,

): void {

  void playSfx(sfxType, volume, toolId)

}

