import random

# (target description, category, difficulty)
# `target` is fed straight into the vision-verification prompt, so keep each
# one phrased as something a photo could clearly show or not show.
QUEST_POOL = [
    # --- Plants & trees -----------------------------------------------
    ("trees", "plants", "easy"),
    ("flowers", "plants", "easy"),
    ("leaves with an interesting shape", "plants", "easy"),
    ("mushrooms or other fungi", "plants", "medium"),
    ("moss or lichen", "plants", "medium"),
    ("pinecones or seed pods", "plants", "easy"),
    ("a fern", "plants", "easy"),
    ("a vine climbing something", "plants", "medium"),
    ("a plant with thorns or spikes", "plants", "medium"),
    ("a plant growing in a crack or unusual place", "plants", "medium"),
    ("a leaf shaped like a heart", "plants", "hard"),
    ("seeds ready to disperse, like a dandelion puff or maple seed", "plants", "hard"),
    ("a tree with peeling or unusual bark", "plants", "medium"),
    ("roots growing above ground", "plants", "medium"),
    ("a plant with flowers of two or more colors", "plants", "medium"),
    ("a tree with visible fruit, cones, or berries", "plants", "medium"),
    ("a naturally patterned leaf with holes or insect damage", "plants", "hard"),
    ("a plant pollinated by an insect, with the insect visible", "plants", "hard"),
    ("a fallen log covered in multiple kinds of moss or fungi", "plants", "hard"),

    # --- Insects & arachnids --------------------------------------------
    ("insects", "invertebrates", "easy"),
    ("a spider", "invertebrates", "medium"),
    ("a spider web", "invertebrates", "medium"),
    ("a bee or other pollinator on a flower", "invertebrates", "medium"),
    ("a butterfly or moth", "invertebrates", "medium"),
    ("a ladybug", "invertebrates", "medium"),
    ("an ant or a trail of ants", "invertebrates", "easy"),
    ("a caterpillar", "invertebrates", "hard"),
    ("a beetle", "invertebrates", "medium"),
    ("a dragonfly or damselfly", "invertebrates", "hard"),
    ("an insect camouflaged to look like a leaf or stick", "invertebrates", "hard"),
    ("a snail or slug", "invertebrates", "medium"),
    ("an earthworm", "invertebrates", "medium"),
    ("a cocoon or chrysalis", "invertebrates", "hard"),
    ("an insect carrying food or building something", "invertebrates", "hard"),
    ("two different kinds of insects in one photo", "invertebrates", "hard"),
    ("a spider catching or wrapping prey", "invertebrates", "hard"),

    # --- Birds ------------------------------------------------------------
    ("birds", "birds", "easy"),
    ("a bird in flight", "birds", "medium"),
    ("a bird's nest", "birds", "hard"),
    ("feathers", "birds", "medium"),
    ("a bird eating or foraging", "birds", "medium"),
    ("two different bird species in one photo", "birds", "hard"),
    ("a bird displaying colorful feathers", "birds", "hard"),
    ("a bird nest with nesting material visible", "birds", "hard"),

    # --- Mammals ------------------------------------------------------
    ("squirrels or other small mammals", "mammals", "medium"),
    ("animal tracks or footprints", "mammals", "medium"),
    ("evidence an animal has been eating something, like chewed leaves or nutshells", "mammals", "hard"),
    ("fur caught on a branch or fence", "mammals", "hard"),
    ("a burrow or animal den", "mammals", "hard"),
    ("two different kinds of animal tracks", "mammals", "hard"),
    ("a wild mammal interacting with its environment", "mammals", "hard"),

    # --- Reptiles & amphibians ---------------------------------------
    ("a lizard or salamander", "reptiles_amphibians", "hard"),
    ("a frog or toad", "reptiles_amphibians", "hard"),
    ("a snake, photographed from a safe distance", "reptiles_amphibians", "hard"),
    ("a turtle", "reptiles_amphibians", "hard"),
    ("an amphibian hiding under natural cover", "reptiles_amphibians", "hard"),

    # --- Rocks, minerals & land features ------------------------------
    ("rocks or stones", "geology", "easy"),
    ("a rock with more than one color in it", "geology", "medium"),
    ("sand or soil with an interesting texture", "geology", "easy"),
    ("a cliff, boulder, or rock formation", "geology", "medium"),
    ("a fossil or a shell", "geology", "hard"),
    ("a place where water meets land, like a shoreline or riverbank", "geology", "medium"),
    ("visible layers in a cliff, rock, or exposed soil bank", "geology", "hard"),
    ("three distinct types of rock in one outdoor scene", "geology", "hard"),

    # --- Water & weather -------------------------------------------------
    ("clouds", "weather", "easy"),
    ("a puddle or pond reflecting the sky", "weather", "easy"),
    ("dew or raindrops sitting on a leaf or web", "weather", "medium"),
    ("a rainbow", "weather", "hard"),
    ("sunlight streaming through tree branches", "weather", "medium"),
    ("a shadow with an interesting shape", "weather", "easy"),
    ("ice or frost", "weather", "hard"),
    ("a double rainbow", "weather", "hard"),
    ("a dramatic weather pattern with sunlight and dark clouds", "weather", "hard"),

    # --- Patterns & textures ------------------------------------------
    ("something camouflaged in its environment", "patterns", "hard"),
    ("a symmetrical leaf or flower", "patterns", "medium"),
    ("a spiral pattern in nature, like a fern or shell", "patterns", "hard"),
    ("three different colors of flower in one photo", "patterns", "medium"),
    ("something smaller than your thumbnail", "patterns", "medium"),
    ("something taller than you are", "patterns", "easy"),

    # --- Nature meets civilization -------------------------------------
    ("a plant growing through pavement or concrete", "urban_nature", "medium"),
    ("a bird or animal adapted to city life", "urban_nature", "medium"),
    ("a garden or a planted flower bed", "urban_nature", "easy"),
    ("a bird feeder or insect hotel", "urban_nature", "medium"),
    ("wildlife using a human-made structure as shelter", "urban_nature", "hard"),
    ("three different kinds of urban nature in one photo", "urban_nature", "hard"),
]

DIFFICULTY_TIERS = {
    "easy": {"count_range": (2, 3), "points_per_item": 10, "completion_bonus": 20},
    "medium": {"count_range": (1, 3), "points_per_item": 18, "completion_bonus": 30},
    "hard": {"count_range": (1, 2), "points_per_item": 40, "completion_bonus": 75},
}


def generate_quest(exclude_targets=None):
    """Pick a random quest, avoiding recently-seen targets when possible."""
    exclude = set(exclude_targets or [])
    candidates = [q for q in QUEST_POOL if q[0] not in exclude] or QUEST_POOL

    target, category, difficulty = random.choice(candidates)
    tier = DIFFICULTY_TIERS[difficulty]
    target_count = random.randint(*tier["count_range"])
    points_reward = target_count * tier["points_per_item"] + tier["completion_bonus"]

    return {
        "target": target,
        "category": category,
        "difficulty": difficulty,
        "target_count": target_count,
        "points_reward": points_reward,
        "points_per_item": tier["points_per_item"],
        "completion_bonus": tier["completion_bonus"],
    }
