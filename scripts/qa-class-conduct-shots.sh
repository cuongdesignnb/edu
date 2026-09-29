#!/usr/bin/env bash
# Desktop + mobile screenshots for CL06–CL12 (fresh seed per shot).
C=/classroom/demo-school-a/y-a-2026/c-a-10a1
S=D:/Edu/qa/screenshots
shot(){ MSYS_NO_PATHCONV=1 node scripts/shot.mjs "$1" "$2" --as="${3:-u-lan}" --wait=3000 ${4:-}; }
shot "$C/conduct" $S/CL06-desktop.png
shot "$C/conduct/weekly" $S/CL07-desktop.png
shot "$C/conduct/review" $S/CL08-desktop.png
shot "$C/publications" $S/CL09-desktop.png
shot "$C/publications/snap-c-a-10a1-w4-v1" $S/CL10-w4-desktop.png
shot "$C/adjustments" $S/CL11-desktop.png u-dung
shot "$C/rules" $S/CL12-desktop.png
for p in "conduct:CL06" "conduct/weekly:CL07" "conduct/review:CL08" "publications:CL09" "publications/snap-c-a-10a1-w4-v1:CL10" "adjustments:CL11" "rules:CL12"; do
  shot "$C/${p%%:*}" "$S/${p##*:}-mobile.png" u-lan "--w=390 --h=844"
done
shot "$C/conduct" $S/CL06-u-dung-desktop.png u-dung
shot "/classroom/demo-school-b/y-b-2026/c-b-10a1/conduct/review" $S/CL08-school-b-u-hoa.png u-hoa
