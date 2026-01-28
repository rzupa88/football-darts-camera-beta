import inspect
import geometry.board as b

print("FILE:", b.__file__)
print("HAS Dartboard:", hasattr(b, "Dartboard"))
print("NAMES containing 'Dart':", [n for n in dir(b) if "Dart" in n])

print("\n--- SOURCE START ---")
src = inspect.getsource(b)
print(src[:800])
print("--- SOURCE END ---\n")
