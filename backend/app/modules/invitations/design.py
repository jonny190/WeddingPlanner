"""The invitation card designer's document format.

A design is a card of a fixed aspect ratio with a background and a stack of
freely positioned layers (text or image). Positions and widths are percentages
of the card, and font sizes are pixels on a 600px-wide card, so a design scales
to any size. The API validates every design, so renderers can trust it.
"""

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.weddings.models import Event, EventKind

HexColor = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
DESIGN_WIDTH_PX = 600


class FontOption(BaseModel):
    family: str
    category: Literal["serif", "sans-serif", "script"]
    # CSS stack used where the web font cannot load (most email clients).
    fallback: str
    weights: list[int]
    italic: bool
    # The `family=` value for the Google Fonts CSS2 API.
    google_spec: str


_SERIF = "Georgia, 'Times New Roman', serif"
_SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif"
_SCRIPT = "'Snell Roundhand', 'Apple Chancery', 'Brush Script MT', cursive"


def _font(family: str, category: str, weights: list[int], italic: bool) -> FontOption:
    fallback = {"serif": _SERIF, "sans-serif": _SANS, "script": _SCRIPT}[category]
    name = family.replace(" ", "+")
    if weights == [400] and not italic:
        spec = name
    elif italic:
        axes = [f"0,{w}" for w in weights] + ["1,400"]
        spec = f"{name}:ital,wght@{';'.join(axes)}"
    else:
        spec = f"{name}:wght@{';'.join(str(w) for w in weights)}"
    return FontOption(
        family=family,
        category=category,
        fallback=f"'{family}', {fallback}",
        weights=weights,
        italic=italic,
        google_spec=spec,
    )


FONT_CATALOG: list[FontOption] = [
    _font("Playfair Display", "serif", [400, 500, 600, 700], True),
    _font("Cormorant Garamond", "serif", [300, 400, 500, 600, 700], True),
    _font("EB Garamond", "serif", [400, 500, 600, 700], True),
    _font("Libre Baskerville", "serif", [400, 700], True),
    _font("Lora", "serif", [400, 500, 600, 700], True),
    _font("Cinzel", "serif", [400, 500, 600, 700], False),
    _font("Great Vibes", "script", [400], False),
    _font("Parisienne", "script", [400], False),
    _font("Pinyon Script", "script", [400], False),
    _font("Allura", "script", [400], False),
    _font("Dancing Script", "script", [400, 500, 600, 700], False),
    _font("Montserrat", "sans-serif", [300, 400, 500, 600, 700], True),
    _font("Josefin Sans", "sans-serif", [300, 400, 600, 700], True),
    _font("Raleway", "sans-serif", [300, 400, 500, 600, 700], True),
    _font("Lato", "sans-serif", [300, 400, 700], True),
]
FONTS = {f.family: f for f in FONT_CATALOG}


def _check_font(family: str) -> str:
    if family not in FONTS:
        raise ValueError(f"Unsupported font '{family}'")
    return family


class _Placed(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    # Top-left corner and width, as percentages of the card. Slightly off-card is allowed.
    x: float = Field(ge=-50, le=150)
    y: float = Field(ge=-50, le=150)
    width: float = Field(gt=0, le=200)
    rotation: float = Field(default=0, ge=-180, le=180)
    opacity: float = Field(default=1, ge=0, le=1)


class TextLayer(_Placed):
    type: Literal["text"] = "text"
    # May contain placeholders such as {{first_name}}; filled in per guest.
    text: str = Field(max_length=2000)
    font_family: str
    font_size: float = Field(ge=4, le=200)
    font_weight: int = Field(default=400, ge=100, le=900)
    italic: bool = False
    color: HexColor = "#3b302a"
    align: Literal["left", "center", "right"] = "center"
    line_height: float = Field(default=1.3, ge=0.6, le=3)
    letter_spacing: float = Field(default=0, ge=-0.2, le=1)  # em
    uppercase: bool = False

    @field_validator("font_family")
    @classmethod
    def _known_font(cls, value: str) -> str:
        return _check_font(value)


class ImageLayer(_Placed):
    type: Literal["image"] = "image"
    asset_id: uuid.UUID
    border_radius: float = Field(default=0, ge=0, le=50)  # % of the image's width


Layer = Annotated[TextLayer | ImageLayer, Field(discriminator="type")]


class CardBackground(BaseModel):
    color: HexColor = "#fbf7f2"
    image_asset_id: uuid.UUID | None = None
    image_fit: Literal["cover", "contain"] = "cover"
    image_opacity: float = Field(default=1, ge=0, le=1)
    # Optional thin frame inset from the card's edge.
    border_color: HexColor | None = None


class EmailStyle(BaseModel):
    """How the invitation email looks. It links to the full card on the guest's RSVP page."""

    header_asset_id: uuid.UUID | None = None
    background_color: HexColor = "#f6f1eb"
    card_color: HexColor = "#ffffff"
    text_color: HexColor = "#3b302a"
    accent_color: HexColor = "#7a5c4f"
    font_family: str = "Cormorant Garamond"
    button_text: str = Field(default="View your invitation", min_length=1, max_length=60)

    @field_validator("font_family")
    @classmethod
    def _known_font(cls, value: str) -> str:
        return _check_font(value)


class InvitationDesign(BaseModel):
    version: Literal[1] = 1
    # Card height divided by width: 1.4 is a 5x7 portrait card, 1 is square.
    aspect_ratio: float = Field(default=1.4, ge=0.5, le=2.0)
    background: CardBackground = CardBackground()
    layers: list[Layer] = Field(default_factory=list, max_length=60)
    email: EmailStyle = EmailStyle()

    @model_validator(mode="after")
    def _unique_layer_ids(self) -> "InvitationDesign":
        ids = [layer.id for layer in self.layers]
        if len(ids) != len(set(ids)):
            raise ValueError("Layer ids must be unique")
        return self

    def asset_ids(self) -> set[uuid.UUID]:
        ids = {layer.asset_id for layer in self.layers if isinstance(layer, ImageLayer)}
        ids |= {i for i in (self.background.image_asset_id, self.email.header_asset_id) if i}
        return ids

    def font_families(self) -> set[str]:
        fonts = {layer.font_family for layer in self.layers if isinstance(layer, TextLayer)}
        return fonts | {self.email.font_family}


def personalise(design: InvitationDesign, substitute) -> InvitationDesign:
    """Return a copy with placeholders in text layers replaced via ``substitute(text)``."""
    layers = [
        layer.model_copy(update={"text": substitute(layer.text)})
        if isinstance(layer, TextLayer)
        else layer
        for layer in design.layers
    ]
    return design.model_copy(update={"layers": layers})


def fonts_for(families: set[str]) -> list[FontOption]:
    return [FONTS[f] for f in sorted(families) if f in FONTS]


def default_design(event: Event) -> InvitationDesign:
    """A classic portrait card to start from."""
    ink, soft = "#4a3a2f", "#8a7566"
    if event.kind == EventKind.evening:
        invite_line = "invite you to join them\nfor an evening of celebration"
    else:
        invite_line = "request the pleasure of your company\nat their wedding"

    def text(id_: str, value: str, y: float, **style) -> TextLayer:
        return TextLayer(id=id_, text=value, x=10, y=y, width=80, **style)

    layers = [
        text(
            "for",
            "For {{full_name}}",
            7,
            font_family="Montserrat",
            font_size=11,
            letter_spacing=0.25,
            uppercase=True,
            color=soft,
        ),
        text(
            "intro",
            "Together with their families",
            15,
            font_family="Montserrat",
            font_size=12,
            letter_spacing=0.2,
            uppercase=True,
            color=soft,
        ),
        text(
            "names",
            "{{couple_names}}",
            21,
            font_family="Great Vibes",
            font_size=58,
            line_height=1.1,
            color=ink,
        ),
        text(
            "invite",
            invite_line,
            40,
            font_family="Cormorant Garamond",
            font_size=21,
            italic=True,
            color=ink,
        ),
        text(
            "when",
            "{{event_when}}",
            55,
            font_family="Cormorant Garamond",
            font_size=23,
            font_weight=600,
            color=ink,
        ),
        text(
            "venue",
            "{{venue_name}}\n{{venue_address}}",
            63,
            font_family="Cormorant Garamond",
            font_size=18,
            color=ink,
        ),
        text(
            "plus",
            "{{plus_one}}",
            78,
            font_family="Cormorant Garamond",
            font_size=17,
            italic=True,
            color=soft,
        ),
    ]
    if event.rsvp_deadline:
        layers.append(
            text(
                "reply",
                "Kindly reply by {{rsvp_deadline}}",
                86,
                font_family="Montserrat",
                font_size=11,
                letter_spacing=0.2,
                uppercase=True,
                color=soft,
            )
        )
    return InvitationDesign(
        background=CardBackground(color="#fbf7f2", border_color="#d9c6b3"),
        layers=layers,
    )
