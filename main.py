import argparse


def get_neighbour_count(layout, row_idx, cell_idx):
    max_row = len(layout)
    max_col = len(layout[0])
    if not layout[row_idx][cell_idx]:
        return 0
    count = 0
    if row_idx > 0 and layout[row_idx - 1][cell_idx]:
        count += 1
    if row_idx < max_row - 1 and layout[row_idx + 1][cell_idx]:
        count += 1
    if cell_idx > 0 and layout[row_idx][cell_idx - 1]:
        count += 1
    if cell_idx < max_col - 1 and layout[row_idx][cell_idx + 1]:
        count += 1
    return count

def calculate_sre(layout, neighbouring_bonus=1):
    max_row = len(layout)
    max_col = len(layout[0])
    accum = 0
    for i in range(max_row):
        for j in range(max_col):
            if layout[i][j]:
                accum += 1 + get_neighbour_count(layout, i, j) * neighbouring_bonus
    return accum

def calculate_requirements(x, y, reactor_output=40, heat_exchanger_consumption=10,
                         heat_exchanger_output=103.09, offshore_pump_output=1200,
                         steam_turbine_consumption=60, neighbouring_bonus=1):

    layout = [[True for _ in range(x)] for _ in range(y)]
    reactor_count = x * y
    sre = calculate_sre(layout, neighbouring_bonus)
    power = sre * reactor_output
    heat_exchangers = power / heat_exchanger_consumption
    steam = heat_exchangers * heat_exchanger_output
    offshore_pumps = steam / offshore_pump_output
    turbines = steam / steam_turbine_consumption

    return {
        "reactors": reactor_count,
        "offshore_pumps": int(offshore_pumps + 0.999),  # Round up
        "heat_exchangers": int(heat_exchangers + 0.999), # Round up
        "turbines": int(turbines + 0.999), # Round up
        "power": power
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Factorio Nuclear Power Calculator")
    parser.add_argument("-x", type=int, required=True, help="Width of the reactor layout")
    parser.add_argument("-y", type=int, required=True, help="Height of the reactor layout")
    args = parser.parse_args()

    requirements = calculate_requirements(args.x, args.y)

    print(f"For a {args.x}x{args.y} reactor setup:")
    print(f"  Reactors: {requirements['reactors']}")
    print(f"  Offshore Pumps: {requirements['offshore_pumps']}")
    print(f"  Heat Exchangers: {requirements['heat_exchangers']}")
    print(f"  Steam Turbines: {requirements['turbines']}")
    print(f"  Total Power Output: {requirements['power']} MW")