"""Template registry — 30 distinct templates with diverse styles."""

TEMPLATES = {
    # === CENTERED LAYOUTS (serif/classic feel) ===
    "classic":       {"id":"classic","name":"Classic","description":"Centered serif header, traditional rules.","accent":"#1f2937","accent_soft":"#e5e7eb","font":"serif","layout":"centered","has_photo":True},
    "professional":  {"id":"professional","name":"Professional","description":"Forest green accents, clean centered.","accent":"#15803d","accent_soft":"#dcfce7","font":"sans","layout":"centered","has_photo":True},
    "academic":      {"id":"academic","name":"Academic","description":"Traditional serif for research & academia.","accent":"#374151","accent_soft":"#f9fafb","font":"serif","layout":"minimal","has_photo":True},
    "formal":        {"id":"formal","name":"Formal","description":"Navy blue, structured & corporate-ready.","accent":"#1e3a5f","accent_soft":"#e0e7ff","font":"serif","layout":"centered","has_photo":True},
    "heritage":      {"id":"heritage","name":"Heritage","description":"Warm brown tones, timeless elegance.","accent":"#78350f","accent_soft":"#fef3c7","font":"serif","layout":"centered","has_photo":True},

    # === SINGLE COLUMN (modern left-aligned) ===
    "modern":        {"id":"modern","name":"Modern","description":"Bold teal accent bars, left-aligned.","accent":"#0d9488","accent_soft":"#ccfbf1","font":"sans","layout":"single","has_photo":True},
    "elegant":       {"id":"elegant","name":"Elegant","description":"Plum accents, refined serif body.","accent":"#7c3aed","accent_soft":"#ede9fe","font":"serif","layout":"single","has_photo":True},
    "startup":       {"id":"startup","name":"Startup","description":"Electric blue, modern & energetic.","accent":"#2563eb","accent_soft":"#dbeafe","font":"sans","layout":"single","has_photo":True},
    "mint":          {"id":"mint","name":"Mint Fresh","description":"Fresh mint green, clean & approachable.","accent":"#059669","accent_soft":"#d1fae5","font":"sans","layout":"single","has_photo":True},
    "coral":         {"id":"coral","name":"Coral","description":"Warm coral pink, friendly & creative.","accent":"#e11d48","accent_soft":"#ffe4e6","font":"sans","layout":"single","has_photo":True},
    "ocean":         {"id":"ocean","name":"Ocean","description":"Deep ocean blue, calm & professional.","accent":"#0369a1","accent_soft":"#e0f2fe","font":"sans","layout":"single","has_photo":True},

    # === SIDEBAR LAYOUTS (two-column) ===
    "executive":     {"id":"executive","name":"Executive","description":"Navy sidebar for contact & skills.","accent":"#1e3a8a","accent_soft":"#dbeafe","font":"sans","layout":"sidebar","has_photo":True},
    "tech":          {"id":"tech","name":"Tech","description":"Dark sidebar with cyan. Ideal for devs.","accent":"#0891b2","accent_soft":"#cffafe","font":"sans","layout":"sidebar","has_photo":True},
    "corporate":     {"id":"corporate","name":"Corporate","description":"Slate sidebar for management roles.","accent":"#475569","accent_soft":"#f1f5f9","font":"sans","layout":"sidebar","has_photo":True},
    "developer":     {"id":"developer","name":"Developer","description":"Dark charcoal sidebar, green accents.","accent":"#16a34a","accent_soft":"#dcfce7","font":"sans","layout":"sidebar","has_photo":True},
    "architect":     {"id":"architect","name":"Architect","description":"Deep indigo sidebar, structured layout.","accent":"#4338ca","accent_soft":"#e0e7ff","font":"sans","layout":"sidebar","has_photo":True},
    "consultant":    {"id":"consultant","name":"Consultant","description":"Teal sidebar with warm undertones.","accent":"#0f766e","accent_soft":"#ccfbf1","font":"sans","layout":"sidebar","has_photo":True},
    "finance":       {"id":"finance","name":"Finance","description":"Dark green sidebar, trustworthy & solid.","accent":"#166534","accent_soft":"#dcfce7","font":"serif","layout":"sidebar","has_photo":True},
    "designer":      {"id":"designer","name":"Designer","description":"Purple sidebar with creative flair.","accent":"#9333ea","accent_soft":"#f3e8ff","font":"sans","layout":"sidebar","has_photo":True},

    # === BANNER LAYOUTS (colored header band) ===
    "creative":      {"id":"creative","name":"Creative","description":"Orange banner, great for design roles.","accent":"#c2410c","accent_soft":"#ffedd5","font":"sans","layout":"banner","has_photo":True},
    "bold":          {"id":"bold","name":"Bold","description":"Vivid rose banner, strong visual impact.","accent":"#e11d48","accent_soft":"#ffe4e6","font":"sans","layout":"banner","has_photo":True},
    "vibrant":       {"id":"vibrant","name":"Vibrant","description":"Amber banner with warm energy.","accent":"#d97706","accent_soft":"#fef3c7","font":"sans","layout":"banner","has_photo":True},
    "gradient":      {"id":"gradient","name":"Gradient","description":"Deep purple banner, modern & bold.","accent":"#7c3aed","accent_soft":"#ede9fe","font":"sans","layout":"banner","has_photo":True},
    "skyline":       {"id":"skyline","name":"Skyline","description":"Sky blue banner, fresh & confident.","accent":"#0284c7","accent_soft":"#e0f2fe","font":"sans","layout":"banner","has_photo":True},
    "ember":         {"id":"ember","name":"Ember","description":"Deep red banner, powerful & decisive.","accent":"#b91c1c","accent_soft":"#fee2e2","font":"sans","layout":"banner","has_photo":True},

    # === MINIMAL LAYOUTS (airy, lots of whitespace) ===
    "minimal":       {"id":"minimal","name":"Minimal","description":"Airy whitespace, hairline rules.","accent":"#111827","accent_soft":"#f3f4f6","font":"sans","layout":"minimal","has_photo":True},
    "zen":           {"id":"zen","name":"Zen","description":"Ultra-clean with sage green accents.","accent":"#4d7c0f","accent_soft":"#ecfccb","font":"sans","layout":"minimal","has_photo":True},
    "nordic":        {"id":"nordic","name":"Nordic","description":"Cool blue-gray, Scandinavian simplicity.","accent":"#64748b","accent_soft":"#f1f5f9","font":"sans","layout":"minimal","has_photo":True},
    "mono":          {"id":"mono","name":"Mono","description":"Pure black & white, maximum readability.","accent":"#000000","accent_soft":"#f5f5f5","font":"serif","layout":"minimal","has_photo":True},
    "paper":         {"id":"paper","name":"Paper","description":"Warm off-white with brown ink tones.","accent":"#57534e","accent_soft":"#fafaf9","font":"serif","layout":"minimal","has_photo":True},
}

DEFAULT_TEMPLATE = "classic"

def list_templates():
    return list(TEMPLATES.values())

def get_template(template_id: str) -> dict:
    return TEMPLATES.get(template_id, TEMPLATES[DEFAULT_TEMPLATE])
