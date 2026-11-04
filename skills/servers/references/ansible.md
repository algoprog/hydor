# Ansible: one change, many machines

Open this when the same change goes to more than two or three machines, or will be made again. A
playbook describes how the machines should be, runs over SSH, reports per machine what it changed,
and changes nothing the second time when all is already right.

## Set up, on the person's computer

- `pipx install --include-deps ansible` (or `python3 -m pip install ansible` in a virtual
  environment). The servers need only SSH and Python 3. `ansible` includes the common collections;
  with plain `ansible-core`, add the one used below: `ansible-galaxy collection install ansible.posix`.
- A folder for the project, kept in git if the person likes:

```text
servers/
├── hosts.ini
├── site.yml
└── keys/alice.pub
```

```ini
# hosts.ini
[web]
web1 ansible_host=203.0.113.10
web2 ansible_host=203.0.113.11

[web:vars]
ansible_user=alice
```

## A playbook

```yaml
# site.yml
- name: Web servers
  hosts: web
  become: true
  serial: 1                  # one machine at a time
  max_fail_percentage: 0     # stop at the first failure
  tasks:
    - name: Automatic security updates are installed
      ansible.builtin.apt:
        name: unattended-upgrades
        state: present
        update_cache: true
        cache_valid_time: 3600
      when: ansible_facts['os_family'] == 'Debian'

    - name: Alice can log in with her key
      ansible.posix.authorized_key:
        user: alice
        key: "{{ lookup('ansible.builtin.file', 'keys/alice.pub') }}"

    # Only once key logins work for everyone who needs them (see access.md)
    - name: No password logins over SSH
      ansible.builtin.copy:
        dest: /etc/ssh/sshd_config.d/10-hardening.conf
        content: |
          PasswordAuthentication no
          KbdInteractiveAuthentication no
        owner: root
        group: root
        mode: "0644"
        validate: /usr/sbin/sshd -t -f %s
      notify: Reload SSH

  handlers:
    - name: Reload SSH
      ansible.builtin.service:
        name: "{{ 'ssh' if ansible_facts['os_family'] == 'Debian' else 'sshd' }}"
        state: reloaded
```

- Modules (`apt`, `copy`, `template`, `user`, `service`, `authorized_key`) describe a state, so a
  second run reports `ok` instead of `changed`. Use `ansible.builtin.command` only when no module
  fits, with `creates:` or `changed_when:` so it does not claim a change every time.
- `validate:` checks a file before it replaces the old one (`/usr/sbin/visudo -cf %s` for sudo rules).
- A handler runs once at the end, and only when a task that notifies it changed something.
- Package names and service names differ between distributions: group machines by system in the
  inventory, or use `when:` as above.

## Run it, a little at a time

```bash
ansible-inventory -i hosts.ini --graph                         # who is in it
ansible all -i hosts.ini -m ansible.builtin.ping               # can Ansible reach them all
ansible-playbook -i hosts.ini site.yml --syntax-check
ansible-playbook -i hosts.ini site.yml --limit web1 --check --diff   # dry run on one machine
ansible-playbook -i hosts.ini site.yml --limit web1                  # for real on one
ansible-playbook -i hosts.ini site.yml                               # then all, in batches
```

- `--check` only predicts: modules that cannot predict are skipped, and a task depending on an earlier
  one may fail in check mode alone. Treat it as a preview, not proof.
- `--diff` prints file contents: leave it out for files holding secrets.
- Read the recap line per machine: `ok`, `changed`, `failed`, `unreachable`. A run is done only when
  every machine is accounted for.
- After the run, check the service on each machine and from outside (SKILL.md step 8).

## Passwords and secrets

The sudo password comes from the vault: keep it as `WEB_SUDO_PASSWORD` (`request_secret` with
`commands: true`) and put this small script beside the playbook (it holds no secret):

```bash
cat > become-pass.sh <<'EOF'
#!/bin/sh
printf '%s\n' "$WEB_SUDO_PASSWORD"
EOF
chmod 700 become-pass.sh
```

Then run Ansible through `run_with_secrets`:
`ANSIBLE_BECOME_PASSWORD_FILE=./become-pass.sh ansible-playbook -i hosts.ini site.yml --limit web1`.
Ansible runs an executable password file and takes what it prints, so the password stays in the
environment and never lands in a file (tested with ansible-core 2.22).

- Secrets the playbook itself needs (an API key for a config file) are stored encrypted. With
  `run_with_secrets`, and a `vault-pass.sh` that prints `$ANSIBLE_VAULT_PASSWORD` the same way:
  `printf '%s' "$MY_API_KEY" | ansible-vault encrypt_string --vault-password-file ./vault-pass.sh --stdin-name my_api_key >> group_vars/web.yml`.
  Runs then add `--vault-password-file ./vault-pass.sh`. Mark tasks that use such values
  `no_log: true`.
- Never put a password on the command line (`-e ansible_become_password=...`): it shows in the process
  list and shell history.

## When it goes wrong

| Symptom | Look at |
| --- | --- |
| `UNREACHABLE` | Plain `ssh` to the machine with the same user and key; the host key; `ansible_host` |
| Wrong machines included | `ansible-inventory --graph` and `--list-hosts --limit ...` before running |
| "Missing sudo password" | `become: true` without a password: the password file above, or the person's yes for passwordless sudo |
| Python errors on the machine | Python 3 missing there (install it with the package manager first) |
| "python3-apt must be installed to use check mode" | Debian or Ubuntu without `python3-apt`: install it first (a real run installs it by itself) |
| A task "changed" every run | A `command` or `shell` task without `creates:` or `changed_when:`, or a template with a date in it |
| A module not found | The collection is not installed: `ansible-galaxy collection list` |

More detail with `-vvv`, on one machine (`--limit web1`); it can print secrets, so do not paste it
anywhere.
