package com.codewithmosh.store.products;

import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

@AllArgsConstructor
@Service
public class ProductImageService {
    private static final byte[] JPEG_SIGNATURE = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};

    private final ProductRepository productRepository;
    private final ProductImageRepository imageRepository;

    @Transactional
    public Product replaceImage(Long productId, MultipartFile file) throws IOException {
        var product = productRepository.findById(productId).orElseThrow(ProductNotFoundException::new);

        var data = file.getBytes();
        var contentType = detectContentType(data);
        if (contentType == null) {
            throw new InvalidImageException("The photo must be a JPEG, PNG or WebP image.");
        }

        var oldImage = product.getImage();
        product.setImage(imageRepository.save(new ProductImage(contentType, data)));
        productRepository.saveAndFlush(product);
        if (oldImage != null) {
            imageRepository.deleteById(oldImage.getId());
        }

        return product;
    }

    @Transactional
    public Product removeImage(Long productId) {
        var product = productRepository.findById(productId).orElseThrow(ProductNotFoundException::new);

        var image = product.getImage();
        if (image != null) {
            product.setImage(null);
            productRepository.saveAndFlush(product);
            imageRepository.deleteById(image.getId());
        }

        return product;
    }

    // The type is read from the file's first bytes; the Content-Type the browser sent is not trusted.
    private static String detectContentType(byte[] data) {
        if (startsWith(data, JPEG_SIGNATURE)) {
            return "image/jpeg";
        }
        if (startsWith(data, PNG_SIGNATURE)) {
            return "image/png";
        }
        if (data.length >= 12
                && new String(data, 0, 4, StandardCharsets.US_ASCII).equals("RIFF")
                && new String(data, 8, 4, StandardCharsets.US_ASCII).equals("WEBP")) {
            return "image/webp";
        }
        return null;
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        return data.length >= prefix.length && Arrays.equals(data, 0, prefix.length, prefix, 0, prefix.length);
    }
}
