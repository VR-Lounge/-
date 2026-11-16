#!/usr/bin/env python3
"""Wave 19: maximize padded→true multi for highest-price galleries.

Exact-model OEM / press / from-live only. No scale/rotate inventing.
"""
from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
ASSETS = ROOT / "assets" / "enriched"
FROM_LIVE = ROOT / "assets" / "from-live" / "products"
FROM_HERO = ROOT / "assets" / "from-live" / "hero"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-w19-promote/1.0)"
MIN_BYTES = 10_000
TARGET = 4
DHASH_MAX = 5
HASH_SIZE = 8

CORINIUM_OEM = [
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-British-Racing-Green-Left-Facing-Angle-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-British-Racing-Green-Museum-with-feet-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-British-Racing-Green-Room-Scene-Pair.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-British-Racing-Green-Spike-Close-Up-Front-Museum.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-Matte-Black-Left-Facing-Angle-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-Matte-Black-Studio-Guitars-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-Matte-Black-Top-Half-from-below-BW-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-Tectona-Head-on-Roman-Painted-Wall-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-Tectona-Left-Facing-Angle-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-Tectona-Room-Scene-2.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-Tectona-Side-Angle-With-Grille-Mosaic-Wall-Museum-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-Tectona-Top-Half-Light-Museum-Mosaic-Wall-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Corinium-Tweeter-Angle-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Web-Corinium-British-Racing-Green-Top-Studio.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Web-Corinium-Matte-Black-Right-Facing-Studio.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Web-Corinium-Matte-Black-Right-Facing-Studio-Wide-Shot.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Web-Corinium-Tectona-Museum-with-spikes.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2023/10/Web-Corinium-Tectona-Top-Half-Museum-Mosaic-Wall.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2024/07/Corinium-British-Racing-Green-Left-Facing-Angle-inc-Grille-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2024/07/Corinium-Matte-Black-Left-Facing-Angle-inc-Grille-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2024/07/Corinium-Tectona-Left-Facing-Angle-inc-Grille-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2025/11/Silver-Corinium-1-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2026/03/Corinium-Midnight-Silver-Left-Facing-Angle-scaled.jpg",
    "https://acoustic-energy-corinium.co.uk/wp-content/uploads/2026/03/Corinium-Midnight-Silver-Left-Facing-Angle-inc-Grille-scaled.jpg",
    "https://www.acoustic-energy.co.uk/wp-content/uploads/Corinium-Silver-Lifestyle.jpg",
    "https://www.acoustic-energy.co.uk/wp-content/uploads/Corinium-Silver-Lifestyle-scaled.jpg",
]

OEM_PACKS: dict[int, list[str]] = {
    274552: CORINIUM_OEM,
    40225: [  # Persona C Vanta
        *[f"https://www.paradigm.com/{i}-large_default/persona-c.jpg" for i in range(2417, 2425)],
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/07/Persona_C_Black_Front.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/07/paradigm_persona_c_4.jpg",
    ],
    40229: [  # Persona C Silver
        *[f"https://www.paradigm.com/{i}-large_default/persona-c.jpg" for i in range(2417, 2425)],
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/07/Persona_C_Silver.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/07/paradigm_persona_c_4.jpg",
    ],
    266938: [  # XR 13
        *[f"https://www.paradigm.com/{i}-large_default/xr-13.jpg" for i in list(range(3409, 3441)) + [3574, 3575, 3576]],
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13-1.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13-2.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13-3.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13-4.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13-5.png",
    ],
    266932: [  # XR 11
        *[
            f"https://www.paradigm.com/{i}-large_default/xr-11.jpg"
            for i in list(range(3319, 3350)) + [3571, 3572, 3573]
        ],
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-11.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-11-1.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-11-2.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-11-3.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-11-4.png",
    ],
    273537: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/ps_audio_stellar_m1200_7474433664-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/ps_audio_stellar_m1200_7474398880-4.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/ps_audio_stellar_m1200_7474520345-3.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/ps_audio_stellar_m1200_7474508779-2.jpg",
        "https://www.psaudio.com/cdn/shop/files/Stellar_M1200_Black_Front.jpg",
        "https://www.psaudio.com/cdn/shop/files/Stellar_M1200_Silver_Front.jpg",
        "https://www.psaudio.com/cdn/shop/files/Stellar_M1200_Rear.jpg",
        "https://www.psaudio.com/cdn/shop/files/Stellar_M1200_Angle.jpg",
        "https://www.psaudio.com/cdn/shop/products/stellar-m1200-black.jpg",
        "https://www.psaudio.com/cdn/shop/products/stellar-m1200-silver.jpg",
        "https://www.psaudio.com/cdn/shop/products/stellar-m1200-rear.jpg",
    ],
    271070: [
        "https://www.monitoraudio.com/site/assets/files/54574/gold-500-life.2000x0.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_500_6g_4829953124-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_500_6g_4829953764-2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_500_6g3.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_500_6g4.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_500_6g5.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_500_6g6.jpg",
    ],
    271065: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_5g_11358644044-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_5g_11358707249-2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_5g_11358729657-3.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_5g4.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_5g5.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_5g6.jpg",
    ],
    271034: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_6g_4805340370-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_6g_4805341042-2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_6g3.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_6g4.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_6g5.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_300_6g6.jpg",
    ],
    271060: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_200_5g_11358603623-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_200_5g_11358781841-2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_200_5g_11358841678-3.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_200_5g4.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_200_5g5.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/monitor_audio_gold_200_5g6.jpg",
    ],
    274575: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/04/ae-520-new-w950-ae-mpic-0-1597953317.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/04/ae-520-new-w950-ae-mpic-0-1597953323.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/04/ae-520-new-w950-ae-mpic-0-1597953329.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/04/ae-520-new-w950-ae-mpic-0-1597953334.jpg",
        "https://www.acoustic-energy.co.uk/wp-content/uploads/AE520-Walnut.jpg",
        "https://www.acoustic-energy.co.uk/wp-content/uploads/AE520-Piano-Black.jpg",
        "https://www.acoustic-energy.co.uk/wp-content/uploads/AE520-Piano-White.jpg",
        "https://www.acoustic-energy.co.uk/wp-content/uploads/AE520-rear.jpg",
    ],
    274398: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/03/of-4-4717-canor-cd-1-10-01.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/03/of-4-2928-canor-cd-1-10-12.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/03/CD_1_10_Rear.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/03/CD_1_10_Front.jpg",
        "https://www.canor-audio.com/data/gallery/cd1.10/cd1.10_01.jpg",
        "https://www.canor-audio.com/data/gallery/cd1.10/cd1.10_02.jpg",
        "https://www.canor-audio.com/data/gallery/cd1.10/cd1.10_03.jpg",
        "https://www.canor-audio.com/data/gallery/cd1.10/cd1.10_04.jpg",
        "https://www.canor-audio.com/img/products/cd1-10/cd1-10-front.jpg",
        "https://www.canor-audio.com/img/products/cd1-10/cd1-10-rear.jpg",
        "https://www.canor-audio.com/img/products/cd1-10/cd1-10-angle.jpg",
    ],
    270778: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/arcam_pa720_10392255257-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/arcam_pa720_10392263454-2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/arcam_pa720-3.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/arcam_pa720-4.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/arcam_pa720-5.jpg",
        "https://www.arcam.co.uk/ugc/products/product/images/original/PA720_Front_Black.jpg",
        "https://www.arcam.co.uk/ugc/products/product/images/original/PA720_Rear.jpg",
        "https://www.arcam.co.uk/ugc/products/product/images/original/PA720_Angle.jpg",
    ],
    25156: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2020/02/Anthem-P2-Back.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/01/ysilitel_moshnosti_Anthem_Statement_P_2_BL.jpg",
        "https://www.anthemav.com/media/products/statement-p2-front.jpg",
        "https://www.anthemav.com/media/products/statement-p2-rear.jpg",
        "https://www.anthemav.com/media/products/statement-p2-angle.jpg",
        "https://www.anthemav.com/uploads/products/P2_Front.png",
        "https://www.anthemav.com/uploads/products/P2_Rear.png",
        "https://www.anthemav.com/uploads/products/P2_Angle.png",
    ],
    25160: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/01/ysilitel_moshnosti_Anthem_Statement_M_1_BL.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2020/02/1f23b2a75f315aa31ea4a48e7a68a029.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2020/02/ca6d27944a98732d773eb75f32b01932.jpg",
        "https://www.anthemav.com/uploads/products/M1_Front.png",
        "https://www.anthemav.com/uploads/products/M1_Rear.png",
        "https://www.anthemav.com/uploads/products/M1_Angle.png",
    ],
    34458: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/03/40c4f54b81664235fd9f7ad5f85862ba.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/03/7f6b33d4eff63a80fb0014da03d88ce2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/03/f0dc8e4eb98d46b8a71bb55d19da3e09.jpg",
        "https://www.anthemav.com/uploads/products/STR_Integrated_Front.png",
        "https://www.anthemav.com/uploads/products/STR_Integrated_Rear.png",
        "https://www.anthemav.com/uploads/products/STR_Integrated_Angle.png",
        "https://www.anthemav.com/media/products/str-integrated-front.jpg",
        "https://www.anthemav.com/media/products/str-integrated-rear.jpg",
    ],
    262129: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/10/Soulnote-D-2-SE.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/10/Soulnote-D-2-SE-rear-500x193-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/10/Soulnote-D-2-SE-side.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/10/Soulnote-D-2.jpg",
        "https://soulnote.audio/img/products/d-2/d-2_front.jpg",
        "https://soulnote.audio/img/products/d-2/d-2_rear.jpg",
        "https://soulnote.audio/img/products/d-2/d-2_angle.jpg",
    ],
    16798: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/01/integralnii_ysilitel_Spec_RSA_M1EX.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/10/SPEC-RSA-M1-EX-rear.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/10/SPEC-RSA-M1-EX-rear-500x178-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/10/SPEC-RSA-M1-EX-front.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/10/SPEC-RSA-M1-EX-angle.jpg",
    ],
    34699: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/03/Audio_Physic_Scorpio_25-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/03/audio_physic_scorpio_25_1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/03/Audio_Physic_Scorpio_25-2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/03/Audio_Physic_Scorpio_25-3.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/03/Audio_Physic_Scorpio_25-4.jpg",
    ],
    261114: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/01/sp20vs115-1.jpg",
        "https://soundstageglobal.com/images/stories/shows-events/cedia-expo-2013-denver-usa/140-cedia-expo-2013-features/421-audio-research-sp20-preamplifier/IMG_1453.jpg",
        "https://soundstageglobal.com/images/stories/shows-events/cedia-expo-2013-denver-usa/140-cedia-expo-2013-features/421-audio-research-sp20-preamplifier/IMG_1447.jpg",
        "https://soundstageglobal.com/images/stories/shows-events/cedia-expo-2013-denver-usa/140-cedia-expo-2013-features/421-audio-research-sp20-preamplifier/IMG_1436.jpg",
        "https://soundstageglobal.com/images/stories/shows-events/cedia-expo-2013-denver-usa/140-cedia-expo-2013-features/421-audio-research-sp20-preamplifier/IMG_1437.jpg",
        "https://soundstageglobal.com/images/stories/shows-events/cedia-expo-2013-denver-usa/140-cedia-expo-2013-features/421-audio-research-sp20-preamplifier/IMG_1441.jpg",
        "https://soundstageglobal.com/images/stories/shows-events/cedia-expo-2013-denver-usa/140-cedia-expo-2013-features/421-audio-research-sp20-preamplifier/IMG_1442.jpg",
        "https://www.usaudiomart.com/images/uploads/6367870.jpg",
        "https://www.usaudiomart.com/images/uploads/6367871.jpg",
        "https://www.usaudiomart.com/images/uploads/6367872.jpg",
        "https://www.usaudiomart.com/images/uploads/6367873.jpg",
    ],
    16832: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/01/ysilitel_moshnosti_Triode_TRV_P845SE.jpg",
        "https://im.nazarov-gallery.ru/pic/1200/1200/upload/iblock/b83/b835210f4d6794658ab13db66995e2d2.jpg",
        "https://www.triode.co.jp/english/img/trv-p845se.jpg",
        "https://www.triode.co.jp/english/img/trv-p845se_2.jpg",
        "https://www.triode.co.jp/img/product/trv-p845se.jpg",
        "https://www.triode.co.jp/img/product/trv-p845se_2.jpg",
        "https://www.triode.co.jp/img/product/trv-p845se_3.jpg",
    ],
    274019: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/sd_3100_hv1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/sd_3100_hv2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/psd_3100_hv_174679554-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/psd_3100_hv2.jpg",
    ],
    4318: [  # Lawrence Violin SE — exact only (no Acapella)
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/01/napolnaia_akystika_Lawrence_Audio_Violin_SE.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/01/napolnaia_akystika_Lawrence_Audio_Violin.jpg",
    ],
}

LOCAL_GLOBS: dict[int, list[str]] = {
    273537: ["*stellar_m1200*"],
    266938: ["*xr-13*", "*xr_13*"],
    266932: ["*xr-11*", "*xr_11*"],
    271070: ["*gold_500_6g*"],
    271065: ["*gold_300_5g*"],
    271034: ["*gold_300_6g*"],
    271060: ["*gold_200_5g*"],
    274575: ["*ae-520*"],
    270778: ["*pa720*"],
    274398: ["*canor*cd*1*10*", "*CD_1_10*", "*of-4-*canor*"],
    25156: ["*Statement_P_2*", "*Anthem-P2*"],
    25160: ["*Statement_M_1*"],
    274552: ["*corinium*"],
    40225: ["*Persona_C*", "*persona_c*"],
    40229: ["*Persona_C*", "*persona_c*"],
    34699: ["*Scorpio*", "*scorpio*"],
    16798: ["*RSA_M1*", "*RSA-M1*"],
    262129: ["*Soulnote-D-2*", "*soulnote*d*2*"],
    16832: ["*P845SE*", "*p845se*", "*TRV_P845*"],
    261114: ["*sp20*"],
    274019: ["sd_3100*", "psd_3100*"],  # not sdv
}

WRONG_MODEL: dict[int, list[str]] = {
    4318: ["acapella", "Acapella"],
    274019: ["sdv_3100", "sdv-3100"],
}

PAD_RE = re.compile(
    r"local-variant://|_w17(?:sc\d*|r\d*|sq|dsc\d*|fsc\d*|hsc\d*|redl|dsh)\b|_w1[3-6]var\b",
    re.I,
)


def dhash(path: Path) -> int | None:
    try:
        with Image.open(path) as im:
            im = im.convert("L").resize((HASH_SIZE + 1, HASH_SIZE), Image.Resampling.BILINEAR)
            pixels = list(im.getdata())
    except Exception:
        return None
    bits = 0
    for row in range(HASH_SIZE):
        for col in range(HASH_SIZE):
            if pixels[row * (HASH_SIZE + 1) + col] > pixels[row * (HASH_SIZE + 1) + col + 1]:
                bits |= 1 << (row * HASH_SIZE + col)
    return bits


def is_pad(g: dict) -> bool:
    blob = f"{g.get('src') or ''} {g.get('local') or ''}"
    if PAD_RE.search(blob):
        return True
    src = (g.get("src") or "").split("?")[0]
    if re.search(r"-(?:1280x|2048x)(?=\.|$)", src, re.I):
        return True
    m = re.search(r"-(\d+)x(\d+)\.(?:jpe?g|png|webp|gif)$", src, re.I)
    if m and max(int(m.group(1)), int(m.group(2))) <= 600:
        return True
    return False


def wrong_model(g: dict, pid: int) -> bool:
    tokens = WRONG_MODEL.get(pid) or []
    if not tokens:
        return False
    blob = f"{g.get('src') or ''} {g.get('local') or ''}".lower()
    return any(t.lower() in blob for t in tokens)


def download(url: str, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size >= MIN_BYTES:
        head = dest.read_bytes()[:200]
        if head.lstrip().startswith(b"<"):
            dest.unlink(missing_ok=True)
        else:
            return dest.stat().st_size
    try:
        host = urlparse(url).netloc
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Referer": f"https://{host}/", "Accept": "image/*,*/*"},
        )
        with urllib.request.urlopen(req, timeout=45) as r:
            data = r.read()
            ctype = (r.headers.get("Content-Type") or "").lower()
        if len(data) < MIN_BYTES:
            return 0
        if data[:200].lstrip().startswith(b"<") or b"<html" in data[:400].lower():
            return 0
        if not (
            data[:3] == b"\xff\xd8\xff"
            or data[:8] == b"\x89PNG\r\n\x1a\n"
            or data[:4] == b"RIFF"
            or "image" in ctype
        ):
            return 0
        dest.write_bytes(data)
        return len(data)
    except Exception as e:
        print(f"  fail {url[-70:]}: {type(e).__name__}")
        return 0


def ext_of(url: str) -> str:
    p = url.split("?")[0].lower()
    for e in (".png", ".webp", ".jpg", ".jpeg"):
        if p.endswith(e):
            return ".jpg" if e == ".jpeg" else e
    return ".jpg"


def local_glob_slots(pid: int, name: str) -> list[dict]:
    patterns = LOCAL_GLOBS.get(pid) or []
    out: list[dict] = []
    seen: set[str] = set()
    roots = [FROM_LIVE, FROM_HERO]
    for root in roots:
        if not root.exists():
            continue
        for pat in patterns:
            for p in root.glob(pat):
                if not p.is_file() or p.stat().st_size < MIN_BYTES:
                    continue
                # exclude wrong models via filename
                if pid == 274019 and "sdv" in p.name.lower():
                    continue
                if pid == 4318 and "acapella" in p.name.lower():
                    continue
                key = str(p.resolve())
                if key in seen:
                    continue
                seen.add(key)
                out.append(
                    {
                        "src": f"from-live://{p.name}",
                        "thumb": f"from-live://{p.name}",
                        "alt": name,
                        "local": str(p.relative_to(ROOT)),
                        "bytes": p.stat().st_size,
                        "from": "from-live-w19",
                        "wave": "gallery-w19-2026-11",
                    }
                )
    return out


def rebuild_gallery(pid: int, extra_urls: list[str] | None = None) -> dict:
    path = PDP / f"{pid}.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    before = list(d.get("gallery") or [])
    before_n = len(before)
    name = d.get("name") or ""

    candidates: list[dict] = []
    for g in before:
        if not isinstance(g, dict):
            continue
        if is_pad(g) or wrong_model(g, pid):
            continue
        candidates.append(g)

    asset = ASSETS / str(pid)
    asset.mkdir(parents=True, exist_ok=True)

    for url in extra_urls or []:
        hsh = hashlib.sha1(url.encode()).hexdigest()[:10]
        dest = asset / f"{hsh}_w19{ext_of(url)}"
        size = download(url, dest)
        if size < MIN_BYTES:
            continue
        candidates.append(
            {
                "src": url.split("?")[0],
                "thumb": url,
                "alt": name,
                "local": str(dest.relative_to(ROOT)),
                "bytes": size,
                "from": "oem-w19",
                "wave": "gallery-w19-2026-11",
            }
        )

    candidates.extend(local_glob_slots(pid, name))

    scored: list[tuple[int, str, dict, int | None]] = []
    for g in candidates:
        loc = g.get("local") or ""
        lp = ROOT / loc if loc else None
        if not lp or not lp.exists():
            continue
        size = lp.stat().st_size
        h = dhash(lp)
        scored.append((size, loc, g, h))
    scored.sort(key=lambda t: (-t[0], t[1]))

    kept: list[dict] = []
    hashes: list[int] = []
    seen_src: set[str] = set()
    for size, _, g, h in scored:
        src = g.get("src") or ""
        if src in seen_src:
            continue
        if h is not None and any((h ^ eh).bit_count() <= DHASH_MAX for eh in hashes):
            continue
        if h is not None:
            hashes.append(h)
        kept.append(g)
        if src:
            seen_src.add(src)
        if len(kept) >= 8:
            break

    d["gallery"] = kept
    multi = len(kept) >= TARGET
    d["galleryHitl"] = not multi
    if not multi:
        note = (d.get("enrichmentNote") or "").rstrip()
        tag = " HITL gallery: <4 distinct perceptual angles after w19 OEM hunt."
        if "after w19" not in note:
            d["enrichmentNote"] = (note + tag).strip()
    else:
        note = d.get("enrichmentNote") or ""
        if "after w19 OEM hunt" in note:
            d["enrichmentNote"] = note.replace(
                "HITL gallery: <4 distinct perceptual angles after w19 OEM hunt.", ""
            ).strip()
    d["galleryDepaddedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    d["galleryWave19"] = True
    path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "id": pid,
        "name": name,
        "price": d.get("price"),
        "before": before_n,
        "after": len(kept),
        "multi": multi,
        "hitl": bool(d.get("galleryHitl")),
    }


def main() -> None:
    audit_path = ROOT / "data/enrichment/gallery-padding-audit.json"
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    price = {i["id"]: i.get("price") or 0 for i in audit.get("items") or []}
    prev_class = {i["id"]: i.get("class") for i in audit.get("items") or []}

    padded_ids = [
        i["id"]
        for i in audit["items"]
        if i["class"] in ("padded", "single_real") and (i.get("price") or 0) >= 350_000
    ]
    targets = sorted(
        set(list(OEM_PACKS.keys()) + list(LOCAL_GLOBS.keys()) + padded_ids[:120]),
        key=lambda p: -(price.get(p) or 0),
    )

    results = []
    for pid in targets:
        if not (PDP / f"{pid}.json").exists():
            continue
        urls = OEM_PACKS.get(pid, [])
        print(f"promote {pid} urls={len(urls)} …")
        r = rebuild_gallery(pid, urls)
        r["prevClass"] = prev_class.get(pid)
        results.append(r)
        print(" ", {k: r[k] for k in ("id", "after", "multi", "prevClass", "price")})

    newly = [
        r["id"]
        for r in results
        if r["multi"] and r.get("prevClass") in ("padded", "single_real")
    ]
    out = {
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tried": len(results),
        "nowMulti": sum(1 for r in results if r["multi"]),
        "newlyMultiIds": newly,
        "paddedToTrue": len(newly),
        "results": results,
    }
    (ROOT / "data/enrichment/wave19-promote.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wave19 promote multi={out['nowMulti']}/{out['tried']} newly={len(newly)}")
    print("newly:", newly)


if __name__ == "__main__":
    main()
