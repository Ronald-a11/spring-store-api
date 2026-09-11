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
    private final AuthService authService;
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
        user.setRole(adminProperties.isAdmin(user.getEmail()) ? Role.ADMIN : Role.USER);
        // A concurrent registration can pass the check above; the unique index on email catches it.
        try {
            userRepository.save(user);
        } catch (DataIntegrityViolationException ex) {
            throw new DuplicateUserException();
        }

        return userMapper.toDto(user);
    }

    public UserDto updateUser(Long userId, UpdateUserRequest request) {
        checkAccess(userId);
        var user = userRepository.findById(userId).orElseThrow(UserNotFoundException::new);
        if (!user.getEmail().equals(request.getEmail()) && userRepository.existsByEmail(request.getEmail())) {
            throw new DuplicateUserException();
        }
        // A user who moves onto a listed address would be promoted to ADMIN at the next start.
        if (!user.getEmail().equals(request.getEmail()) && adminProperties.isAdmin(request.getEmail())
                && authService.getCurrentUser().getRole() != Role.ADMIN) {
            throw new UserAccessDeniedException("Only an admin can change an e-mail to one listed in ADMIN_EMAILS.");
        }
        userMapper.update(request, user);
        // Same race as in registerUser.
        try {
            userRepository.save(user);
        } catch (DataIntegrityViolationException ex) {
            throw new DuplicateUserException();
        }

        return userMapper.toDto(user);
    }

    public void deleteUser(Long userId) {
        checkAccess(userId);
        var user = userRepository.findById(userId).orElseThrow(UserNotFoundException::new);
        userRepository.delete(user);
    }

    public void changePassword(Long userId, ChangePasswordRequest request) {
        checkAccess(userId);
        var user = userRepository.findById(userId).orElseThrow(UserNotFoundException::new);

        if (!passwordEncoder.matches(request.getOldPassword(), user.getPassword())) {
            throw new AccessDeniedException("Password does not match");
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    private void checkAccess(Long userId) {
        var currentUser = authService.getCurrentUser();
        if (currentUser == null || (currentUser.getRole() != Role.ADMIN && !currentUser.getId().equals(userId))) {
            throw new UserAccessDeniedException();
        }
    }
}
