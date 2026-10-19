#ifdef EMERALD_MINIAUDIO_VORBIS
#define STB_VORBIS_HEADER_ONLY
#include "extras/stb_vorbis.c"
#endif
#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"
#ifdef EMERALD_MINIAUDIO_VORBIS
#undef STB_VORBIS_HEADER_ONLY
#include "extras/stb_vorbis.c"
#endif
