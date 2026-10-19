import sys
S = sys.argv[1]
def load(p):
    d = {}
    for line in open(p, encoding='utf-8'):
        line = line.rstrip('\n')
        if not line or line.count('|') < 2: continue
        n, check, result = line.split('|', 2)
        d[(int(n), check)] = result
    return d
b, a = load(S + '/before.txt'), load(S + '/after.txt')
new = {'inbox','automations','ai_knowledge','videos','questions','app_logins','packages','class_settings','staff_hours'}
def expected(n, mod, act):
    admin = 'true' if n == 1 else 'false'
    if mod == 'inbox': return b[(n, f'perm leads {act}')]
    if mod in ('automations', 'ai_knowledge'): return b[(n, 'perm leads view')] if act == 'view' else admin
    if mod == 'app_logins': return b[(n, f'perm students {act}')]
    if mod == 'videos': return b[(n, f'perm classrooms {act}')] if act != 'delete' else admin
    return admin
bad = 0
for key in sorted(set(b) | set(a)):
    n, check = key
    if check.startswith('perm ') and check.split()[1] in new:
        _, mod, act = check.split()
        want = expected(n, mod, act)
        if a.get(key) != want:
            bad += 1; print(f'NEW TICK DIFFERS  account {n} {check}: expected {want}, got {a.get(key)}')
    elif b.get(key) != a.get(key):
        bad += 1; print(f'CHANGED  account {n} {check}: before {b.get(key)!r} after {a.get(key)!r}')
print(f'{len(b)} checks, {bad} differences')
