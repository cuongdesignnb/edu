"""Extract purely decorative illustration regions from the reference concepts.
Only illustration areas are cropped (no text, KPI or UI). Output: public/assets/illustrations."""
from PIL import Image
import os
R = 'references'
OUT = 'public/assets/illustrations'
os.makedirs(OUT, exist_ok=True)
CROPS = {
  'school-header.png': ('screens/01-platform-overview.png', (1228, 78, 1440, 168)),
  'school-sidebar.png': ('screens/01-platform-overview.png', (34, 642, 246, 758)),
  'role-platform.png': ('screens/01-platform-overview.png', (310, 320, 386, 406)),
  'role-school.png': ('screens/01-platform-overview.png', (576, 320, 654, 406)),
  'role-teacher.png': ('screens/01-platform-overview.png', (848, 320, 926, 406)),
  'role-parent.png': ('screens/01-platform-overview.png', (1133, 320, 1215, 406)),
  'teachers-trio.png': ('screens/04-teachers-and-permissions.png', (1195, 74, 1440, 168)),
  'teacher-board.png': ('screens/05-teacher-my-classes.png', (1188, 74, 1425, 170)),
  'students-trio.png': ('screens/05-teacher-my-classes.png', (312, 180, 424, 292)),
  'students-duo.png': ('screens/05-teacher-my-classes.png', (318, 788, 398, 842)),
  'students-pair.png': ('screens/02-school-overview.png', (976, 886, 1140, 1012)),
  'kids-school.png': ('screens/09-activities-evidence-announcements.png', (1096, 80, 1440, 226)),
  'activity-trophy.png': ('screens/09-activities-evidence-announcements.png', (314, 308, 422, 410)),
  'activity-stem.png': ('screens/09-activities-evidence-announcements.png', (314, 436, 422, 540)),
  'activity-clean.png': ('screens/09-activities-evidence-announcements.png', (314, 564, 422, 668)),
  'family-header.png': ('screens/10-parent-portal-overview.png', (1176, 8, 1446, 132)),
  'family-sidebar.png': ('screens/10-parent-portal-overview.png', (24, 718, 196, 892)),
  'family-laptop.png': ('planning/11-sitemap-board.png', (18, 680, 232, 818)),
  'girl-clipboard.png': ('planning/12-screen-checklist-board.png', (1140, 830, 1300, 1025)),
  'books-plant.png': ('planning/14-ux-states-and-flows-board.png', (1095, 72, 1192, 150)),
}
for name, (src, box) in CROPS.items():
    im = Image.open(os.path.join(R, src)).convert('RGBA')
    im.crop(box).save(os.path.join(OUT, name), optimize=True)
    print(name, box)
