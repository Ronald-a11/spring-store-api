package com.codewithmosh.store.users;

import com.codewithmosh.store.auth.AuthService;
import lombok.AllArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Set;

@AllArgsConstructor
@Service
public class UserService {
    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    // Fix beyond the course: needed to check that the caller owns the account (or is an admin).
    private final AuthService authService;
    // Fix beyond the course: the ADMIN_EMAILS list, so a listed e-mail registers as ADMIN.
    private final AdminProperties adminProperties;

    public Iterable<UserDto> getAllUsers(String sortBy) {
        if (!Set.of("name", "email").contains(sortBy))
            sortBy = "name";

        return userRepository.findAll(Sort.by(sortBy))
                .stream()
                .map(userMapper::toDto)
                .toList();
    }

    public UserDto getUser(Long userId) {
        // Fix beyond the course: owner-or-admin check (see checkAccess).
        checkAccess(userId);
        var user = userRepository.findById(userId).orElseThrow(UserNotFoundException::new);
        return userMapper.toDto(user);
    }

    public UserDto registerUser(RegisterUserRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new DuplicateUserException();
        }

        var user = userMapper.toEntity(request);
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        // Fix beyond the course: an e-mail listed in ADMIN_EMAILS (AdminProperties) registers as ADMIN instead of USER.
        user.setRole(adminProperties.isAdmin(user.getEmail()) ? Role.ADMIN : Role.USER);
        // Fix beyond the course: a concurrent registration can slip past the check above; the unique index (V6) catches it.
        try {
            userRepository.save(user);
        } catch (DataIntegrityViolationException ex) {
            throw new DuplicateUserException();
        }

        return userMapper.toDto(user);
    }

    public UserDto updateUser(Long userId, UpdateUserRequest request) {
        // Fix beyond the course: owner-or-admin check (see checkAccess).
        checkAccess(userId);
        var user = userRepository.findById(userId).orElseThrow(UserNotFoundException::new);
        // Fix beyond the course: reject an e-mail that already belongs to another user.
        if (!user.getEmail().equals(request.getEmail()) && userRepository.existsByEmail(request.getEmail())) {
            throw new DuplicateUserException();
        }
        // Fix beyond the course: a listed (ADMIN_EMAILS) address with no account yet would earn whoever moves onto it the
        // ADMIN role at the next start (AdminBootstrap), so only an admin may change an e-mail to one.
        if (!user.getEmail().equals(request.getEmail()) && adminProperties.isAdmin(request.getEmail())
                && authService.getCurrentUser().getRole() != Role.ADMIN) {
            throw new UserAccessDeniedException("Only an admin can change an e-mail to one listed in ADMIN_EMAILS.");
        }
        userMapper.update(request, user);
        // Fix beyond the course: same race as in registerUser; the unique index (V6) catches it.
        try {
            userRepository.save(user);
        } catch (DataIntegrityViolationException ex) {
            throw new DuplicateUserException();
        }

        return userMapper.toDto(user);
    }

    public void deleteUser(Long userId) {
        // Fix beyond the course: owner-or-admin check (see checkAccess).
        checkAccess(userId);
        var user = userRepository.findById(userId).orElseThrow(UserNotFoundException::new);
        userRepository.delete(user);
    }

    public void changePassword(Long userId, ChangePasswordRequest request) {
        // Fix beyond the course: owner-or-admin check (see checkAccess).
        checkAccess(userId);
        var user = userRepository.findById(userId).orElseThrow(UserNotFoundException::new);

        if (!passwordEncoder.matches(request.getOldPassword(), user.getPassword())) {
            throw new AccessDeniedException("Password does not match");
        }

        // Fix beyond the course: hash the new password instead of storing it in plaintext.
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    // Fix beyond the course: only the account owner or an admin may read/update/delete a user or change its password.
    private void checkAccess(Long userId) {
        var currentUser = authService.getCurrentUser();
        if (currentUser == null || (currentUser.getRole() != Role.ADMIN && !currentUser.getId().equals(userId))) {
            throw new UserAccessDeniedException();
        }
    }
}
